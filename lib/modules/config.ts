import { convexClient } from "@/lib/convex";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { InstalledModuleRecord, ModuleRouteConfig } from "@/lib/modules/manifest";

export const MODULES_REGISTRY_KEY = "modules.registry";
export const MODULES_ROUTES_KEY = "modules.routes";

function clean(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
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

export function parseInstalledModules(raw?: string | null): InstalledModuleRecord[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const out: InstalledModuleRecord[] = [];
    for (const item of parsed) {
      if (!item || typeof item !== "object" || Array.isArray(item)) continue;
      const row = item as Record<string, unknown>;
      const id = clean(row.id);
      const name = clean(row.name);
      const version = clean(row.version);
      if (!id || !name || !version) continue;
      const toolPrefixes = Array.isArray(row.toolPrefixes)
        ? row.toolPrefixes.map((v) => clean(v)).filter((v): v is string => Boolean(v))
        : undefined;
      const routes = (() => {
        if (!Array.isArray(row.routes)) return undefined;
        const parsedRoutes: NonNullable<InstalledModuleRecord["routes"]> = [];
        for (const value of row.routes) {
          if (!value || typeof value !== "object" || Array.isArray(value)) continue;
          const route = value as Record<string, unknown>;
          const routePath = clean(route.path);
          if (!routePath) continue;
          parsedRoutes.push({
            path: routePath,
            title: clean(route.title),
            icon: clean(route.icon),
          });
        }
        return parsedRoutes.length > 0 ? parsedRoutes : undefined;
      })();

      out.push({
        id,
        name,
        version,
        description: clean(row.description),
        author: clean(row.author),
        homepage: clean(row.homepage),
        toolPrefixes: toolPrefixes && toolPrefixes.length > 0 ? toolPrefixes : undefined,
        routes,
        enabled: row.enabled !== false,
        source: row.source === "registry" || row.source === "imported" ? row.source : "local",
        installedAt: typeof row.installedAt === "number" ? row.installedAt : Date.now(),
        updatedAt: typeof row.updatedAt === "number" ? row.updatedAt : undefined,
      });
    }
    return out;
  } catch {
    return [];
  }
}

export function serializeInstalledModules(modules: InstalledModuleRecord[]): string {
  const cleaned = modules.map((m) => ({
    id: m.id,
    name: m.name,
    version: m.version,
    description: m.description,
    author: m.author,
    homepage: m.homepage,
    toolPrefixes: m.toolPrefixes && m.toolPrefixes.length > 0 ? m.toolPrefixes : undefined,
    routes: m.routes && m.routes.length > 0 ? m.routes : undefined,
    enabled: m.enabled !== false,
    source: m.source,
    installedAt: m.installedAt,
    updatedAt: m.updatedAt,
  }));
  return JSON.stringify(cleaned);
}

export function parseModuleRoutes(raw?: string | null): Record<string, ModuleRouteConfig> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: Record<string, ModuleRouteConfig> = {};
    for (const [moduleId, value] of Object.entries(parsed as Record<string, unknown>)) {
      const id = clean(moduleId);
      if (!id) continue;
      const route = normalizeRouteConfig(value);
      if (route.mode || route.providerProfileId || route.provider || route.model) {
        out[id] = route;
      }
    }
    return out;
  } catch {
    return {};
  }
}

export function serializeModuleRoutes(routes: Record<string, ModuleRouteConfig>): string {
  const cleaned: Record<string, ModuleRouteConfig> = {};
  for (const [moduleId, route] of Object.entries(routes || {})) {
    const id = clean(moduleId);
    if (!id) continue;
    const normalized = normalizeRouteConfig(route);
    if (normalized.mode || normalized.providerProfileId || normalized.provider || normalized.model) {
      cleaned[id] = normalized;
    }
  }
  return JSON.stringify(cleaned);
}

async function getConfigValues(
  gatewayId: Id<"gateways">,
  keys: string[],
): Promise<Record<string, string>> {
  try {
    return await convexClient.query(api.functions.gatewayConfig.getMultiple, { gatewayId, keys });
  } catch {
    return await convexClient.query(api.functions.config.getMultiple, { keys });
  }
}

export async function readModuleConfig(gatewayId: string | Id<"gateways">): Promise<{
  installedModules: InstalledModuleRecord[];
  routes: Record<string, ModuleRouteConfig>;
}> {
  const values = await getConfigValues(gatewayId as Id<"gateways">, [
    MODULES_REGISTRY_KEY,
    MODULES_ROUTES_KEY,
  ]);
  return {
    installedModules: parseInstalledModules(values[MODULES_REGISTRY_KEY]),
    routes: parseModuleRoutes(values[MODULES_ROUTES_KEY]),
  };
}

function startsWithToolPrefix(toolName: string, prefix: string): boolean {
  if (!prefix) return false;
  if (toolName === prefix) return true;
  return toolName.startsWith(`${prefix}.`) || toolName.startsWith(`${prefix}:`) || toolName.startsWith(`${prefix}/`);
}

function inferModuleIdFromToolName(toolName: string): string | undefined {
  const value = clean(toolName);
  if (!value) return undefined;
  const match = value.match(/^([a-z0-9-]+)/i);
  return match ? match[1].toLowerCase() : undefined;
}

export function findModuleForTool(
  toolName: string,
  installedModules: InstalledModuleRecord[],
): InstalledModuleRecord | null {
  if (!toolName || installedModules.length === 0) return null;
  const enabled = installedModules.filter((m) => m.enabled !== false);
  for (const module of enabled) {
    const prefixes = module.toolPrefixes || [];
    if (prefixes.some((prefix) => startsWithToolPrefix(toolName, prefix))) {
      return module;
    }
  }
  const inferredId = inferModuleIdFromToolName(toolName);
  if (!inferredId) return null;
  return enabled.find((m) => m.id === inferredId) || null;
}

export function resolveModuleToolRoute(
  toolName: string,
  installedModules: InstalledModuleRecord[],
  routes: Record<string, ModuleRouteConfig>,
): ModuleRouteConfig | null {
  const module = findModuleForTool(toolName, installedModules);
  if (!module) return null;
  const route = routes[module.id];
  if (!route) return null;
  const hasOverride = Boolean(route.providerProfileId || route.provider || route.model);
  if (route.mode === "default") return null;
  if (route.mode !== "module" && !hasOverride) return null;
  return route;
}
