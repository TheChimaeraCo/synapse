import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";

import { GatewayError, getGatewayContext, handleGatewayError } from "@/lib/gateway-context";
import { getWorkspacePath } from "@/lib/workspace";
import { convexClient } from "@/lib/convex";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  backupVaultEntryToConvex,
  DEFAULT_VAULT_PATH,
  getDefaultVaultPath,
  getGatewayInheritedValue,
  isConvexVaultBackupEnabled,
  normalizeRelative,
} from "@/lib/vaultBackup";

const IGNORED_DIRS = new Set([".git", "node_modules", ".next", "dist", "build"]);
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const DEFAULT_MAX_FILES = 1500;

function resolveWithinRoot(root: string, relativePath: string): string {
  const clean = normalizeRelative(relativePath);
  if (clean === null) throw new GatewayError(400, `Invalid path: ${relativePath}`);
  const resolved = path.resolve(root, clean || ".");
  if (!resolved.startsWith(root)) throw new GatewayError(403, "Path escapes vault root");
  return resolved;
}

function parseMaxFiles(input: unknown): number {
  const n = Number.parseInt(String(input ?? ""), 10);
  if (!Number.isFinite(n)) return DEFAULT_MAX_FILES;
  return Math.max(1, Math.min(5000, n));
}

function parseLastResult(raw: string): any {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

async function setGatewayValue(gatewayId: string, key: string, value: string): Promise<void> {
  await convexClient.mutation(api.functions.gatewayConfig.set, {
    gatewayId: gatewayId as Id<"gateways">,
    key,
    value,
  });
}

export async function GET(req: NextRequest) {
  try {
    const { gatewayId } = await getGatewayContext(req);
    const [enabled, vaultPath, lastRunAtRaw, lastResultRaw] = await Promise.all([
      isConvexVaultBackupEnabled(gatewayId),
      getDefaultVaultPath(gatewayId),
      getGatewayInheritedValue(gatewayId, "sync.obsidian.convex_backup_last_run_at"),
      getGatewayInheritedValue(gatewayId, "sync.obsidian.convex_backup_last_result"),
    ]);
    return NextResponse.json({
      enabled,
      vaultPath: vaultPath || DEFAULT_VAULT_PATH,
      lastRunAt: lastRunAtRaw ? Number(lastRunAtRaw) : null,
      lastResult: parseLastResult(lastResultRaw),
    });
  } catch (err) {
    return handleGatewayError(err);
  }
}

export async function POST(req: NextRequest) {
  let gatewayId = "";
  let summary: Record<string, unknown> = {};
  try {
    const ctx = await getGatewayContext(req);
    gatewayId = ctx.gatewayId;
    if (ctx.role !== "owner" && ctx.role !== "admin") {
      throw new GatewayError(403, "Owner/admin role required");
    }

    const body = await req.json().catch(() => ({}));
    const maxFiles = parseMaxFiles(body?.maxFiles);

    const workspace = await getWorkspacePath(gatewayId);
    const configuredVaultPath = await getDefaultVaultPath(gatewayId);
    const vaultPath = configuredVaultPath || DEFAULT_VAULT_PATH;
    const vaultRoot = resolveWithinRoot(workspace, vaultPath);
    await fs.mkdir(vaultRoot, { recursive: true });

    const absoluteFiles: string[] = [];
    const queue = [vaultRoot];
    while (queue.length > 0 && absoluteFiles.length < maxFiles) {
      const current = queue.shift() as string;
      const entries = await fs.readdir(current, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.name.startsWith(".obsidian")) continue;
        if (IGNORED_DIRS.has(entry.name)) continue;
        const abs = path.join(current, entry.name);
        if (entry.isDirectory()) {
          queue.push(abs);
          continue;
        }
        if (!entry.isFile()) continue;
        absoluteFiles.push(abs);
        if (absoluteFiles.length >= maxFiles) break;
      }
    }

    const runId = `vault-full-${Date.now()}`;
    let backedUp = 0;
    let skippedLarge = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const absFile of absoluteFiles) {
      try {
        const stat = await fs.stat(absFile);
        if (stat.size > MAX_FILE_BYTES) {
          skippedLarge += 1;
          continue;
        }
        const relativePath = path.relative(vaultRoot, absFile).replace(/\\/g, "/");
        const content = await fs.readFile(absFile);
        await backupVaultEntryToConvex({
          gatewayId,
          vaultPath,
          relativePath,
          source: "manual_full",
          runId,
          content,
          mtimeMs: Math.floor(stat.mtimeMs),
        });
        backedUp += 1;
      } catch (err: any) {
        failed += 1;
        if (errors.length < 10) errors.push(err?.message || "Unknown backup error");
      }
    }

    summary = {
      ok: failed === 0,
      runId,
      vaultPath,
      scanned: absoluteFiles.length,
      backedUp,
      skippedLarge,
      failed,
      errors,
      finishedAt: Date.now(),
    };

    await Promise.all([
      setGatewayValue(gatewayId, "sync.obsidian.convex_backup_last_run_at", String(Date.now())),
      setGatewayValue(gatewayId, "sync.obsidian.convex_backup_last_result", JSON.stringify(summary)),
    ]);

    return NextResponse.json(summary);
  } catch (err) {
    if (gatewayId) {
      const failedSummary = {
        ok: false,
        ...summary,
        error: err instanceof Error ? err.message : "Unknown backup error",
        finishedAt: Date.now(),
      };
      try {
        await Promise.all([
          setGatewayValue(gatewayId, "sync.obsidian.convex_backup_last_run_at", String(Date.now())),
          setGatewayValue(gatewayId, "sync.obsidian.convex_backup_last_result", JSON.stringify(failedSummary)),
        ]);
      } catch {}
    }
    return handleGatewayError(err);
  }
}

