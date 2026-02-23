import { promises as fs } from "fs";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { GatewayError, getGatewayContext, handleGatewayError } from "@/lib/gateway-context";
import { convexClient } from "@/lib/convex";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { logAudit } from "@/lib/auditLog";
import {
  exportModuleToRegistry,
  findModuleManifest,
  importModulePackage,
  listLocalManifests,
  listRegistryPackages,
} from "@/lib/modules/registry";
import {
  MODULES_REGISTRY_KEY,
  MODULES_ROUTES_KEY,
  parseInstalledModules,
  parseModuleRoutes,
  serializeInstalledModules,
  serializeModuleRoutes,
} from "@/lib/modules/config";
import type { InstalledModuleRecord, ModulePackage, ModuleRouteConfig } from "@/lib/modules/manifest";

const MAX_MODULE_REQUEST_BYTES = 1_500_000;
const MAX_IMPORT_PACKAGE_BYTES = 1_000_000;
const IMPORT_RATE_WINDOW_MS = 10 * 60 * 1000;
const IMPORT_RATE_LIMIT = 8;

function clean(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

function requireModuleManager(role: string): void {
  if (role !== "owner" && role !== "admin") {
    throw new GatewayError(403, "Owner/admin role required");
  }
}

async function checkImportRateLimit(
  gatewayId: string,
  userId: string,
): Promise<{ allowed: boolean; retryAfter?: number; attempts: number }> {
  // Distributed limiter: count recent module.import audit records for this user+gateway.
  const now = Date.now();
  const threshold = now - IMPORT_RATE_WINDOW_MS;
  const rows = await convexClient.query(api.functions.auditLog.search, {
    userId: userId as Id<"authUsers">,
    limit: 300,
  });

  const recentImports = rows.filter((row: any) => {
    if (row?.action !== "module.import") return false;
    if (typeof row?.timestamp !== "number" || row.timestamp < threshold) return false;
    const details = typeof row?.details === "string" ? row.details : "";
    return details.includes(`gateway=${gatewayId}`);
  });

  if (recentImports.length >= IMPORT_RATE_LIMIT) {
    const oldestTs = recentImports.reduce((min: number, row: any) => {
      const ts = typeof row?.timestamp === "number" ? row.timestamp : now;
      return Math.min(min, ts);
    }, now);
    const retryAfterMs = oldestTs + IMPORT_RATE_WINDOW_MS - now;
    const retryAfter = Math.max(1, Math.ceil(retryAfterMs / 1000));
    return { allowed: false, retryAfter, attempts: recentImports.length };
  }

  return { allowed: true, attempts: recentImports.length };
}

function byteLengthOf(value: string): number {
  return Buffer.byteLength(value, "utf8");
}

function normalizeRouteConfig(value: unknown): ModuleRouteConfig {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const raw = value as Record<string, unknown>;
  const mode = raw.mode === "module" ? "module" : raw.mode === "default" ? "default" : undefined;
  return {
    mode,
    providerProfileId: clean(raw.providerProfileId),
    provider: clean(raw.provider),
    model: clean(raw.model),
  };
}

async function getModuleState(gatewayId: Id<"gateways">): Promise<{
  installedModules: InstalledModuleRecord[];
  routes: Record<string, ModuleRouteConfig>;
}> {
  const keys = [MODULES_REGISTRY_KEY, MODULES_ROUTES_KEY];
  try {
    const values = await convexClient.query(api.functions.gatewayConfig.getMultiple, { gatewayId, keys });
    return {
      installedModules: parseInstalledModules(values[MODULES_REGISTRY_KEY]),
      routes: parseModuleRoutes(values[MODULES_ROUTES_KEY]),
    };
  } catch {
    const values = await convexClient.query(api.functions.config.getMultiple, { keys });
    return {
      installedModules: parseInstalledModules(values[MODULES_REGISTRY_KEY]),
      routes: parseModuleRoutes(values[MODULES_ROUTES_KEY]),
    };
  }
}

async function saveModuleState(
  gatewayId: Id<"gateways">,
  installedModules: InstalledModuleRecord[],
  routes: Record<string, ModuleRouteConfig>,
): Promise<void> {
  const payload = {
    [MODULES_REGISTRY_KEY]: serializeInstalledModules(installedModules),
    [MODULES_ROUTES_KEY]: serializeModuleRoutes(routes),
  };

  try {
    for (const [key, value] of Object.entries(payload)) {
      await convexClient.mutation(api.functions.gatewayConfig.set, { gatewayId, key, value });
    }
  } catch {
    for (const [key, value] of Object.entries(payload)) {
      await convexClient.mutation(api.functions.config.set, { key, value });
    }
  }
}

function upsertInstalledModule(
  modules: InstalledModuleRecord[],
  next: InstalledModuleRecord,
): InstalledModuleRecord[] {
  const now = Date.now();
  const existingIndex = modules.findIndex((m) => m.id === next.id);
  if (existingIndex < 0) {
    return [{ ...next, installedAt: next.installedAt || now }, ...modules];
  }

  const existing = modules[existingIndex];
  const merged: InstalledModuleRecord = {
    ...existing,
    ...next,
    installedAt: existing.installedAt || next.installedAt || now,
    updatedAt: now,
  };
  const copy = [...modules];
  copy.splice(existingIndex, 1, merged);
  return copy;
}

function sortModules(modules: InstalledModuleRecord[]): InstalledModuleRecord[] {
  return [...modules].sort((a, b) => {
    if (a.enabled !== b.enabled) return a.enabled ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

async function installFromRegistryIfNeeded(sourcePath: string): Promise<void> {
  const pkgFile = path.join(sourcePath, "module-package.json");
  try {
    const raw = await fs.readFile(pkgFile, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    await importModulePackage(parsed);
  } catch {
    // Optional materialization. If package data isn't available, keep install metadata only.
  }
}

function parseImportPackage(input: unknown): unknown {
  if (typeof input === "string") {
    return JSON.parse(input);
  }
  return input;
}

export async function GET(req: NextRequest) {
  try {
    const { gatewayId, role } = await getGatewayContext(req);
    requireModuleManager(role);
    const gwId = gatewayId as Id<"gateways">;

    const [state, localManifests, registryPackages] = await Promise.all([
      getModuleState(gwId),
      listLocalManifests(),
      listRegistryPackages(),
    ]);

    const installedById = new Map(state.installedModules.map((m) => [m.id, m]));

    const local = localManifests
      .map((entry) => {
        const installed = installedById.get(entry.manifest.id);
        return {
          manifest: entry.manifest,
          source: entry.source,
          sourcePath: entry.sourcePath,
          installed: Boolean(installed),
          enabled: installed?.enabled ?? false,
        };
      })
      .sort((a, b) => a.manifest.name.localeCompare(b.manifest.name));

    const registry = registryPackages
      .map((entry) => {
        const installed = installedById.get(entry.manifest.id);
        return {
          manifest: entry.manifest,
          packagePath: entry.packagePath,
          installed: Boolean(installed && installed.version === entry.manifest.version),
          enabled: installed?.enabled ?? false,
        };
      })
      .sort((a, b) => {
        const keyCompare = a.manifest.id.localeCompare(b.manifest.id);
        if (keyCompare !== 0) return keyCompare;
        return a.manifest.version < b.manifest.version ? 1 : -1;
      });

    return NextResponse.json({
      installed: sortModules(state.installedModules),
      routes: state.routes,
      local,
      registry,
    });
  } catch (err) {
    return handleGatewayError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const { gatewayId, role, userId } = await getGatewayContext(req);
    requireModuleManager(role);
    const gwId = gatewayId as Id<"gateways">;
    const rawBody = await req.text();
    if (byteLengthOf(rawBody) > MAX_MODULE_REQUEST_BYTES) {
      return NextResponse.json({ error: "Request payload is too large" }, { status: 413 });
    }
    let body: Record<string, unknown> = {};
    try {
      body = (rawBody ? JSON.parse(rawBody) : {}) as Record<string, unknown>;
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    const action = clean(body.action);
    if (!action) {
      return NextResponse.json({ error: "Missing action" }, { status: 400 });
    }

    const state = await getModuleState(gwId);
    let installedModules = [...state.installedModules];
    let routes = { ...state.routes };

    if (action === "install") {
      const moduleId = clean(body.moduleId);
      const version = clean(body.version);
      if (!moduleId) {
        return NextResponse.json({ error: "moduleId is required" }, { status: 400 });
      }
      const found = await findModuleManifest(moduleId, version);
      if (!found) {
        return NextResponse.json({ error: `Module "${moduleId}" not found` }, { status: 404 });
      }
      if (found.source === "registry") {
        await installFromRegistryIfNeeded(found.sourcePath);
      }

      installedModules = upsertInstalledModule(installedModules, {
        id: found.manifest.id,
        name: found.manifest.name,
        version: found.manifest.version,
        description: found.manifest.description,
        author: found.manifest.author,
        homepage: found.manifest.homepage,
        toolPrefixes: found.manifest.toolPrefixes,
        routes: found.manifest.routes,
        enabled: true,
        source: found.source,
        installedAt: Date.now(),
        updatedAt: Date.now(),
      });
      routes[found.manifest.id] = routes[found.manifest.id] || { mode: "default" };
      await saveModuleState(gwId, installedModules, routes);
      await logAudit(
        userId,
        "module.install",
        "module",
        `Installed module ${found.manifest.id}@${found.manifest.version} from ${found.source}`,
        found.manifest.id,
      );
      return NextResponse.json({ ok: true, installed: sortModules(installedModules), routes });
    }

    if (action === "uninstall") {
      const moduleId = clean(body.moduleId);
      if (!moduleId) {
        return NextResponse.json({ error: "moduleId is required" }, { status: 400 });
      }
      installedModules = installedModules.filter((m) => m.id !== moduleId);
      if (routes[moduleId]) {
        const nextRoutes = { ...routes };
        delete nextRoutes[moduleId];
        routes = nextRoutes;
      }
      await saveModuleState(gwId, installedModules, routes);
      await logAudit(
        userId,
        "module.uninstall",
        "module",
        `Uninstalled module ${moduleId}`,
        moduleId,
      );
      return NextResponse.json({ ok: true, installed: sortModules(installedModules), routes });
    }

    if (action === "toggle") {
      const moduleId = clean(body.moduleId);
      const enabled = Boolean(body.enabled);
      if (!moduleId) {
        return NextResponse.json({ error: "moduleId is required" }, { status: 400 });
      }
      const hit = installedModules.find((m) => m.id === moduleId);
      if (!hit) {
        return NextResponse.json({ error: `Module "${moduleId}" is not installed` }, { status: 404 });
      }
      installedModules = installedModules.map((m) => (
        m.id === moduleId ? { ...m, enabled, updatedAt: Date.now() } : m
      ));
      await saveModuleState(gwId, installedModules, routes);
      await logAudit(
        userId,
        enabled ? "module.enable" : "module.disable",
        "module",
        `${enabled ? "Enabled" : "Disabled"} module ${moduleId}`,
        moduleId,
      );
      return NextResponse.json({ ok: true, installed: sortModules(installedModules), routes });
    }

    if (action === "setRouting") {
      const moduleId = clean(body.moduleId);
      if (!moduleId) {
        return NextResponse.json({ error: "moduleId is required" }, { status: 400 });
      }
      const route = normalizeRouteConfig(body.route);
      routes[moduleId] = route;
      await saveModuleState(gwId, installedModules, routes);
      await logAudit(
        userId,
        "module.route",
        "module",
        `Updated routing for ${moduleId}: mode=${route.mode || "default"}, profile=${route.providerProfileId || "-"}, provider=${route.provider || "-"}, model=${route.model || "-"}`,
        moduleId,
      );
      return NextResponse.json({ ok: true, installed: sortModules(installedModules), routes });
    }

    if (action === "export") {
      const moduleId = clean(body.moduleId);
      const version = clean(body.version);
      if (!moduleId) {
        return NextResponse.json({ error: "moduleId is required" }, { status: 400 });
      }
      const pkg = await exportModuleToRegistry(moduleId, version);
      await logAudit(
        userId,
        "module.export",
        "module",
        `Exported module ${pkg.manifest.id}@${pkg.manifest.version}`,
        pkg.manifest.id,
      );
      return NextResponse.json({ ok: true, package: pkg });
    }

    if (action === "import") {
      const rateLimit = await checkImportRateLimit(gatewayId, userId);
      if (!rateLimit.allowed) {
        await logAudit(
          userId,
          "module.import_blocked",
          "module",
          `Blocked module import by rate limit gateway=${gatewayId} attempts=${rateLimit.attempts} retryAfter=${rateLimit.retryAfter}s`,
        );
        return NextResponse.json(
          { error: "Too many module import requests", retryAfter: rateLimit.retryAfter },
          { status: 429, headers: { "Retry-After": String(rateLimit.retryAfter) } },
        );
      }
      let pkgInput: unknown;
      try {
        pkgInput = parseImportPackage(body.package ?? body.packageJson);
      } catch {
        return NextResponse.json({ error: "Invalid package JSON" }, { status: 400 });
      }
      if (pkgInput === undefined) {
        return NextResponse.json({ error: "packageJson is required" }, { status: 400 });
      }
      const importBytes = typeof pkgInput === "string"
        ? byteLengthOf(pkgInput)
        : byteLengthOf(JSON.stringify(pkgInput));
      if (importBytes > MAX_IMPORT_PACKAGE_BYTES) {
        return NextResponse.json(
          { error: `Module package too large (max ${MAX_IMPORT_PACKAGE_BYTES} bytes)` },
          { status: 413 },
        );
      }

      const pkg = await importModulePackage(pkgInput) as ModulePackage;
      const autoInstall = body.install !== false;
      if (autoInstall) {
        installedModules = upsertInstalledModule(installedModules, {
          id: pkg.manifest.id,
          name: pkg.manifest.name,
          version: pkg.manifest.version,
          description: pkg.manifest.description,
          author: pkg.manifest.author,
          homepage: pkg.manifest.homepage,
          toolPrefixes: pkg.manifest.toolPrefixes,
          routes: pkg.manifest.routes,
          enabled: true,
          source: "imported",
          installedAt: Date.now(),
          updatedAt: Date.now(),
        });
        routes[pkg.manifest.id] = routes[pkg.manifest.id] || { mode: "default" };
        await saveModuleState(gwId, installedModules, routes);
      }
      await logAudit(
        userId,
        "module.import",
        "module",
        `Imported module ${pkg.manifest.id}@${pkg.manifest.version} (${autoInstall ? "installed" : "registry-only"}) gateway=${gatewayId}`,
        pkg.manifest.id,
      );
      return NextResponse.json({
        ok: true,
        imported: pkg.manifest,
        installed: sortModules(installedModules),
        routes,
      });
    }

    return NextResponse.json({ error: `Unknown action "${action}"` }, { status: 400 });
  } catch (err) {
    return handleGatewayError(err);
  }
}
