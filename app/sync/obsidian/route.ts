import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { createHash } from "crypto";
import { getGatewayContext, GatewayError, handleGatewayError } from "@/lib/gateway-context";
import { convexClient } from "@/lib/convex";
import { api } from "@/convex/_generated/api";
import { getWorkspacePath } from "@/lib/workspace";
import { extractBearerToken, safeEqualSecret } from "@/lib/security";
import { backupVaultEntryToConvex, isConvexVaultBackupEnabled } from "@/lib/vaultBackup";
import {
  isObsidianLiveMode,
  listObsidianPresence,
  presenceRevision,
  removeObsidianPresence,
  upsertObsidianPresence,
} from "@/lib/obsidianPresence";
import {
  matchVaultKey,
  OBSIDIAN_VAULTS_CONFIG_KEY,
  parseVaults,
  serializeVaults,
} from "@/lib/obsidianVaults";
import type { Id } from "@/convex/_generated/dataModel";

export const runtime = "nodejs";

const DEFAULT_VAULT_PATH = "obsidian-vault";
const DEFAULT_POLL_MS = 2000;
const MIN_POLL_MS = 500;
const MAX_POLL_MS = 15000;
const MAX_VAULT_FILES = 20000;
const MAX_SINGLE_FILE_BYTES = 10 * 1024 * 1024;
const MAX_WRITE_BYTES = 20 * 1024 * 1024;
const MAX_OPERATIONS = 500;
const IGNORED_DIRS = new Set([".git", "node_modules", ".next", "dist", "build"]);

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, X-Gateway-Id, Accept",
  "Access-Control-Max-Age": "86400",
};

interface SyncContext {
  gatewayId: string;
  userId?: string;
  role?: "owner" | "admin" | "member" | "viewer" | string;
  authMode: "session" | "token";
  vaultPathScope?: string;
}

interface VaultFileMeta {
  path: string;
  size: number;
  mtimeMs: number;
}

interface ObsidianOperation {
  op: "upsert" | "delete" | "mkdir";
  path: string;
  content?: string;
  encoding?: "utf8" | "base64";
}

interface SyncAuditPayload {
  gatewayId?: string;
  userId?: string;
  method: "GET" | "POST";
  outcome: "success" | "error";
  authMode?: "session" | "token";
  vaultPath?: string;
  stream?: boolean;
  filePath?: string;
  operations?: number;
  applied?: number;
  statusCode?: number;
  message?: string;
}

interface PresencePayload {
  clientId?: string;
  clientName?: string;
  activeFile?: string;
  cursor?: {
    line?: unknown;
    ch?: unknown;
    anchorLine?: unknown;
    anchorCh?: unknown;
    headLine?: unknown;
    headCh?: unknown;
  };
  isTyping?: boolean;
  mode?: "sync" | "live";
  offline?: boolean;
}

function cleanString(value: unknown, maxLen = 256): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maxLen);
}

function clampPollMs(input?: string | null): number {
  const value = Number.parseInt(input || "", 10);
  if (!Number.isFinite(value)) return DEFAULT_POLL_MS;
  return Math.max(MIN_POLL_MS, Math.min(MAX_POLL_MS, value));
}

function normalizeRelative(input: string): string | null {
  const normalized = input.replace(/\\/g, "/").replace(/^\/+/, "");
  if (!normalized) return "";
  const parts = normalized.split("/").filter(Boolean);
  if (parts.some((part) => part === "..")) return null;
  return parts.join("/");
}

function resolveWithinRoot(root: string, relativePath: string): string {
  const clean = normalizeRelative(relativePath);
  if (clean === null) throw new GatewayError(400, `Invalid path: ${relativePath}`);
  const resolved = path.resolve(root, clean || ".");
  if (!resolved.startsWith(root)) throw new GatewayError(403, "Path escapes vault root");
  return resolved;
}

function computeRevision(files: VaultFileMeta[]): string {
  const hash = createHash("sha256");
  for (const file of files) {
    hash.update(file.path);
    hash.update(":");
    hash.update(String(file.size));
    hash.update(":");
    hash.update(String(file.mtimeMs));
    hash.update("\n");
  }
  return hash.digest("hex");
}

function asPosixRelative(root: string, absolutePath: string): string {
  return path.relative(root, absolutePath).replace(/\\/g, "/");
}

async function listVaultFiles(vaultRoot: string): Promise<VaultFileMeta[]> {
  const output: VaultFileMeta[] = [];
  const queue: string[] = [vaultRoot];

  while (queue.length > 0) {
    const current = queue.shift() as string;
    const entries = await fs.readdir(current, { withFileTypes: true });

    for (const entry of entries) {
      if (IGNORED_DIRS.has(entry.name)) continue;
      const absolute = path.join(current, entry.name);

      if (entry.isDirectory()) {
        queue.push(absolute);
        continue;
      }

      if (!entry.isFile()) continue;
      const stat = await fs.stat(absolute);
      output.push({
        path: asPosixRelative(vaultRoot, absolute),
        size: stat.size,
        mtimeMs: Math.floor(stat.mtimeMs),
      });
      if (output.length > MAX_VAULT_FILES) {
        throw new GatewayError(413, `Vault has too many files (max ${MAX_VAULT_FILES})`);
      }
    }
  }

  output.sort((a, b) => a.path.localeCompare(b.path));
  return output;
}

function fileSignatureMap(files: VaultFileMeta[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const file of files) {
    map.set(file.path, `${file.size}:${file.mtimeMs}`);
  }
  return map;
}

function diffFiles(previous: VaultFileMeta[], current: VaultFileMeta[]): {
  changed: VaultFileMeta[];
  deleted: string[];
} {
  const prevMap = fileSignatureMap(previous);
  const currentMap = fileSignatureMap(current);
  const currentByPath = new Map(current.map((f) => [f.path, f]));
  const changed: VaultFileMeta[] = [];
  const deleted: string[] = [];

  for (const [filePath, signature] of currentMap.entries()) {
    if (!prevMap.has(filePath) || prevMap.get(filePath) !== signature) {
      const file = currentByPath.get(filePath);
      if (file) changed.push(file);
    }
  }

  for (const filePath of prevMap.keys()) {
    if (!currentMap.has(filePath)) deleted.push(filePath);
  }

  changed.sort((a, b) => a.path.localeCompare(b.path));
  deleted.sort((a, b) => a.localeCompare(b));
  return { changed, deleted };
}

async function getGatewayAuthToken(gatewayId: string): Promise<string> {
  try {
    const fromGateway = await convexClient.query(api.functions.gatewayConfig.getWithInheritance, {
      gatewayId: gatewayId as Id<"gateways">,
      key: "gateway.auth_token",
    });
    if (fromGateway?.value) return fromGateway.value;
  } catch {}

  try {
    const fromGlobal = await convexClient.query(api.functions.config.get, { key: "gateway.auth_token" });
    return fromGlobal || "";
  } catch {
    return "";
  }
}

async function getObsidianVaults(gatewayId: string) {
  try {
    const row = await convexClient.query(api.functions.gatewayConfig.getWithInheritance, {
      gatewayId: gatewayId as Id<"gateways">,
      key: OBSIDIAN_VAULTS_CONFIG_KEY,
    });
    return parseVaults(row?.value || "");
  } catch {
    return [];
  }
}

async function touchVaultKeyLastUsed(gatewayId: string, vaultId: string, keyId: string): Promise<void> {
  try {
    const row = await convexClient.query(api.functions.gatewayConfig.getWithInheritance, {
      gatewayId: gatewayId as Id<"gateways">,
      key: OBSIDIAN_VAULTS_CONFIG_KEY,
    });
    const vaults = parseVaults(row?.value || "");
    const vault = vaults.find((v) => v.id === vaultId);
    if (!vault) return;
    const key = vault.keys.find((k) => k.id === keyId);
    if (!key) return;
    key.lastUsedAt = Date.now();
    await convexClient.mutation(api.functions.gatewayConfig.set, {
      gatewayId: gatewayId as Id<"gateways">,
      key: OBSIDIAN_VAULTS_CONFIG_KEY,
      value: serializeVaults(vaults),
    });
  } catch {}
}

async function resolveSyncContext(
  req: NextRequest,
  opts?: { gatewayId?: string; vaultPath?: string | null },
): Promise<SyncContext> {
  try {
    const sessionCtx = await getGatewayContext(req);
    return {
      gatewayId: sessionCtx.gatewayId,
      userId: sessionCtx.userId,
      role: sessionCtx.role,
      authMode: "session",
    };
  } catch (sessionErr) {
    const token = extractBearerToken(req.headers.get("authorization"));
    if (!token) throw sessionErr;

    const url = new URL(req.url);
    const gatewayId = req.headers.get("X-Gateway-Id")
      || url.searchParams.get("gatewayId")
      || opts?.gatewayId;
    if (!gatewayId) {
      throw new GatewayError(400, "gatewayId is required for token auth");
    }

    const requestedVaultPath = opts?.vaultPath || url.searchParams.get("vaultPath");

    // Try per-vault key auth first
    const vaults = await getObsidianVaults(gatewayId);
    const match = matchVaultKey(vaults, token, requestedVaultPath);
    if (match) {
      void touchVaultKeyLastUsed(gatewayId, match.vault.id, match.key.id);
      return {
        gatewayId,
        authMode: "token",
        vaultPathScope: match.vault.path,
      };
    }

    // Fallback to legacy gateway-wide token
    const expected = await getGatewayAuthToken(gatewayId);
    if (!expected || !safeEqualSecret(token, expected)) {
      throw new GatewayError(403, "Invalid gateway auth token");
    }

    return {
      gatewayId,
      authMode: "token",
    };
  }
}

async function resolveVaultRoot(
  gatewayId: string,
  explicitVaultPath?: string | null,
  scopedVaultPath?: string,
): Promise<{ workspace: string; vaultRoot: string; vaultPath: string }> {
  const workspace = await getWorkspacePath(gatewayId);
  const configuredVaultPath = explicitVaultPath || scopedVaultPath || DEFAULT_VAULT_PATH;
  const cleanVaultPath = normalizeRelative(configuredVaultPath);
  if (cleanVaultPath === null) throw new GatewayError(400, "Invalid vaultPath");
  const vaultPath = cleanVaultPath || DEFAULT_VAULT_PATH;
  if (scopedVaultPath && vaultPath !== scopedVaultPath) {
    throw new GatewayError(403, "Token is scoped to a different vault path");
  }
  const vaultRoot = resolveWithinRoot(workspace, vaultPath);
  await fs.mkdir(vaultRoot, { recursive: true });
  return { workspace, vaultRoot, vaultPath };
}

async function readFileContent(
  vaultRoot: string,
  relativePath: string,
  encoding: "utf8" | "base64",
): Promise<{ content: string; size: number; mtimeMs: number; encoding: "utf8" | "base64" }> {
  const absolute = resolveWithinRoot(vaultRoot, relativePath);
  const stat = await fs.stat(absolute);
  if (!stat.isFile()) throw new GatewayError(400, "Path is not a file");
  if (stat.size > MAX_SINGLE_FILE_BYTES) {
    throw new GatewayError(413, `File too large (max ${MAX_SINGLE_FILE_BYTES} bytes)`);
  }
  const buffer = await fs.readFile(absolute);
  return {
    content: encoding === "base64" ? buffer.toString("base64") : buffer.toString("utf8"),
    size: stat.size,
    mtimeMs: Math.floor(stat.mtimeMs),
    encoding,
  };
}

function ensureWriteAllowed(ctx: SyncContext): void {
  if (ctx.authMode === "token") return;
  if (ctx.role === "owner" || ctx.role === "admin" || ctx.role === "member") return;
  throw new GatewayError(403, "Write sync requires member/admin/owner role");
}

function ssePayload(data: unknown): string {
  return `data: ${JSON.stringify(data)}\n\n`;
}

function withCors(response: NextResponse | Response): NextResponse | Response {
  Object.entries(CORS_HEADERS).forEach(([key, value]) => {
    response.headers.set(key, value);
  });
  return response;
}

function getRequestIp(req: NextRequest): string | undefined {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim();
  return req.headers.get("x-real-ip") || undefined;
}

async function writeSyncAuditLog(req: NextRequest, payload: SyncAuditPayload): Promise<void> {
  try {
    await convexClient.mutation(api.functions.auditLog.log, {
      userId: payload.userId ? (payload.userId as Id<"authUsers">) : undefined,
      action: `sync.obsidian.${payload.outcome}`,
      resource: "obsidian_sync",
      resourceId: payload.gatewayId,
      ip: getRequestIp(req),
      details: JSON.stringify({
        method: payload.method,
        authMode: payload.authMode,
        vaultPath: payload.vaultPath,
        stream: payload.stream,
        filePath: payload.filePath,
        operations: payload.operations,
        applied: payload.applied,
        statusCode: payload.statusCode,
        message: payload.message,
      }),
    });
  } catch (logErr) {
    console.error("[obsidian-sync] Failed to write audit log:", logErr);
  }
}

function normalizePresenceActiveFile(value?: string): string | undefined {
  const cleaned = cleanString(value || "", 1024);
  if (!cleaned) return undefined;
  const normalized = normalizeRelative(cleaned);
  if (normalized === null) return undefined;
  return normalized || undefined;
}

function normalizePresenceCursor(
  cursor?: PresencePayload["cursor"],
): {
  line: number;
  ch: number;
  anchorLine?: number;
  anchorCh?: number;
  headLine?: number;
  headCh?: number;
} | undefined {
  if (!cursor || typeof cursor !== "object") return undefined;
  const line = Number(cursor.line);
  const ch = Number(cursor.ch);
  if (!Number.isFinite(line) || !Number.isFinite(ch)) return undefined;
  const safeLine = Math.max(0, Math.floor(line));
  const safeCh = Math.max(0, Math.floor(ch));
  const anchorLine = Number(cursor.anchorLine);
  const anchorCh = Number(cursor.anchorCh);
  const headLine = Number(cursor.headLine);
  const headCh = Number(cursor.headCh);
  return {
    line: safeLine,
    ch: safeCh,
    anchorLine: Number.isFinite(anchorLine) ? Math.max(0, Math.floor(anchorLine)) : undefined,
    anchorCh: Number.isFinite(anchorCh) ? Math.max(0, Math.floor(anchorCh)) : undefined,
    headLine: Number.isFinite(headLine) ? Math.max(0, Math.floor(headLine)) : undefined,
    headCh: Number.isFinite(headCh) ? Math.max(0, Math.floor(headCh)) : undefined,
  };
}

function updatePresenceForVault(args: {
  gatewayId: string;
  vaultPath: string;
  presence?: PresencePayload;
}): { participants: ReturnType<typeof listObsidianPresence>; liveMode: boolean } | null {
  const clientId = cleanString(args.presence?.clientId || "", 96);
  if (!clientId) return null;
  const name = cleanString(args.presence?.clientName || "", 80) || "Obsidian User";
  if (args.presence?.offline) {
    const participants = removeObsidianPresence({
      gatewayId: args.gatewayId,
      vaultPath: args.vaultPath,
      clientId,
    });
    return { participants, liveMode: isObsidianLiveMode(participants) };
  }
  const participants = upsertObsidianPresence({
    gatewayId: args.gatewayId,
    vaultPath: args.vaultPath,
    clientId,
    name,
    activeFile: normalizePresenceActiveFile(args.presence?.activeFile),
    cursor: normalizePresenceCursor(args.presence?.cursor),
    isTyping: Boolean(args.presence?.isTyping),
    mode: args.presence?.mode === "live" ? "live" : "sync",
  });
  return { participants, liveMode: isObsidianLiveMode(participants) };
}

export async function OPTIONS() {
  return withCors(new NextResponse(null, { status: 204 }));
}

export async function GET(req: NextRequest) {
  let syncCtx: SyncContext | undefined;
  let vaultPath: string | undefined;
  let stream = false;
  let filePath: string | null = null;
  let streamClientId = "";
  try {
    const url = new URL(req.url);
    syncCtx = await resolveSyncContext(req);
    const syncAuthMode = syncCtx.authMode;
    stream = url.searchParams.get("stream") === "true";
    const pollMs = clampPollMs(url.searchParams.get("pollMs"));
    filePath = url.searchParams.get("file");
    const encoding = url.searchParams.get("encoding") === "utf8" ? "utf8" : "base64";
    const resolvedVault = await resolveVaultRoot(
      syncCtx.gatewayId,
      url.searchParams.get("vaultPath"),
      syncCtx.vaultPathScope,
    );
    const { vaultRoot } = resolvedVault;
    vaultPath = resolvedVault.vaultPath;
    const presenceFromQuery: PresencePayload | undefined = stream
      ? {
          clientId: cleanString(url.searchParams.get("clientId") || "", 96),
          clientName: cleanString(url.searchParams.get("clientName") || "", 80),
          activeFile: cleanString(url.searchParams.get("activeFile") || "", 1024),
          mode: cleanString(url.searchParams.get("mode") || "", 8) === "live" ? "live" : "sync",
        }
      : undefined;
    streamClientId = cleanString(presenceFromQuery?.clientId || "", 96);

    if (filePath) {
      const file = await readFileContent(vaultRoot, filePath, encoding);
      await writeSyncAuditLog(req, {
        gatewayId: syncCtx.gatewayId,
        userId: syncCtx.userId,
        method: "GET",
        outcome: "success",
        authMode: syncCtx.authMode,
        vaultPath,
        filePath: normalizeRelative(filePath) ?? filePath,
        message: "file-read",
      });
      return withCors(NextResponse.json({
        vaultPath,
        filePath: normalizeRelative(filePath),
        ...file,
      }));
    }

    if (!stream) {
      const files = await listVaultFiles(vaultRoot);
      await writeSyncAuditLog(req, {
        gatewayId: syncCtx.gatewayId,
        userId: syncCtx.userId,
        method: "GET",
        outcome: "success",
        authMode: syncCtx.authMode,
        vaultPath,
        operations: files.length,
        message: "vault-snapshot",
      });
      return withCors(NextResponse.json({
        vaultPath,
        revision: computeRevision(files),
        files,
      }));
    }

    const encoder = new TextEncoder();
    const streamBody = new ReadableStream({
      async start(controller) {
        let lastFiles: VaultFileMeta[] = [];
        let running = false;
        let lastPresenceRev = "";

        const push = (data: unknown) => {
          controller.enqueue(encoder.encode(ssePayload(data)));
        };

        const pushPresence = (force = false) => {
          if (!vaultPath) return;
          let participants = listObsidianPresence({
            gatewayId: syncCtx!.gatewayId,
            vaultPath,
          });
          if (streamClientId && force) {
            participants = (updatePresenceForVault({
              gatewayId: syncCtx!.gatewayId,
              vaultPath,
              presence: presenceFromQuery,
            })?.participants || participants);
          }
          const nextRev = presenceRevision(participants);
          if (!force && nextRev === lastPresenceRev) return;
          lastPresenceRev = nextRev;
          push({
            type: "presence",
            vaultPath,
            liveMode: isObsidianLiveMode(participants),
            participants,
            ts: Date.now(),
          });
        };

        const sendSnapshot = async () => {
          const files = await listVaultFiles(vaultRoot);
          lastFiles = files;
          push({
            type: "snapshot",
            vaultPath,
            revision: computeRevision(files),
            files,
            ts: Date.now(),
          });
          pushPresence(true);
        };

        const tick = async () => {
          if (running) return;
          running = true;
          try {
            const current = await listVaultFiles(vaultRoot);
            const { changed, deleted } = diffFiles(lastFiles, current);
            if (changed.length > 0 || deleted.length > 0) {
              push({
                type: "changes",
                vaultPath,
                revision: computeRevision(current),
                changed,
                deleted,
                ts: Date.now(),
              });
              lastFiles = current;
            } else {
              push({ type: "heartbeat", ts: Date.now() });
            }
            pushPresence(false);
          } catch (err: any) {
            push({ type: "error", message: err?.message || "Watch tick failed" });
          } finally {
            running = false;
          }
        };

        try {
          push({
            type: "ready",
            vaultPath,
            pollMs,
            authMode: syncAuthMode,
            ts: Date.now(),
          });
          pushPresence(true);
          await sendSnapshot();
        } catch (err: any) {
          push({ type: "error", message: err?.message || "Failed to initialize sync stream" });
          controller.close();
          return;
        }

        const interval = setInterval(() => {
          void tick();
        }, pollMs);

        const abortHandler = () => {
          clearInterval(interval);
          if (vaultPath && streamClientId) {
            updatePresenceForVault({
              gatewayId: syncCtx!.gatewayId,
              vaultPath,
              presence: { clientId: streamClientId, offline: true },
            });
          }
          try {
            controller.close();
          } catch {}
        };
        req.signal.addEventListener("abort", abortHandler);
      },
    });

    await writeSyncAuditLog(req, {
      gatewayId: syncCtx.gatewayId,
      userId: syncCtx.userId,
      method: "GET",
      outcome: "success",
      authMode: syncCtx.authMode,
      vaultPath,
      stream: true,
      message: "stream-started",
    });

    return withCors(new Response(streamBody, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    }));
  } catch (err) {
    const statusCode = err instanceof GatewayError ? err.statusCode : 500;
    await writeSyncAuditLog(req, {
      gatewayId: syncCtx?.gatewayId,
      userId: syncCtx?.userId,
      method: "GET",
      outcome: "error",
      authMode: syncCtx?.authMode,
      vaultPath,
      stream,
      filePath: filePath ? (normalizeRelative(filePath) ?? filePath) : undefined,
      statusCode,
      message: err instanceof Error ? err.message : "Unknown error",
    });
    return withCors(handleGatewayError(err));
  }
}

export async function POST(req: NextRequest) {
  let syncCtx: SyncContext | undefined;
  let vaultPath: string | undefined;
  let operationCount = 0;
  let backupEnabled = false;
  let backedUp = 0;
  const backupErrors: string[] = [];
  try {
    const rawBody = await req.text();
    let body: {
      gatewayId?: string;
      vaultPath?: string;
      operations?: ObsidianOperation[];
      presence?: PresencePayload;
      presenceOnly?: boolean;
    } = {};
    try {
      body = (rawBody ? JSON.parse(rawBody) : {}) as {
        gatewayId?: string;
        vaultPath?: string;
        operations?: ObsidianOperation[];
        presence?: PresencePayload;
        presenceOnly?: boolean;
      };
    } catch {
      await writeSyncAuditLog(req, {
        method: "POST",
        outcome: "error",
        statusCode: 400,
        message: "Invalid JSON body",
      });
      return withCors(NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }));
    }
    syncCtx = await resolveSyncContext(req, { gatewayId: body.gatewayId, vaultPath: body.vaultPath });
    ensureWriteAllowed(syncCtx);
    const resolvedVault = await resolveVaultRoot(syncCtx.gatewayId, body.vaultPath, syncCtx.vaultPathScope);
    const { vaultRoot } = resolvedVault;
    vaultPath = resolvedVault.vaultPath;
    const operations = Array.isArray(body.operations) ? body.operations : [];
    operationCount = operations.length;
    backupEnabled = await isConvexVaultBackupEnabled(syncCtx.gatewayId);
    const presenceState = updatePresenceForVault({
      gatewayId: syncCtx.gatewayId,
      vaultPath,
      presence: body.presence,
    });

    if (body.presenceOnly) {
      await writeSyncAuditLog(req, {
        gatewayId: syncCtx.gatewayId,
        userId: syncCtx.userId,
        method: "POST",
        outcome: "success",
        authMode: syncCtx.authMode,
        vaultPath,
        operations: 0,
        applied: 0,
        message: "presence-updated",
      });
      return withCors(NextResponse.json({
        ok: true,
        presence: presenceState || {
          participants: listObsidianPresence({ gatewayId: syncCtx.gatewayId, vaultPath }),
          liveMode: false,
        },
      }));
    }

    if (operations.length === 0) {
      const files = await listVaultFiles(vaultRoot);
      await writeSyncAuditLog(req, {
        gatewayId: syncCtx.gatewayId,
        userId: syncCtx.userId,
        method: "POST",
        outcome: "success",
        authMode: syncCtx.authMode,
        vaultPath,
        operations: 0,
        applied: 0,
        message: "no-ops",
      });
      return withCors(NextResponse.json({
        ok: true,
        applied: 0,
        presence: presenceState || undefined,
        vaultPath,
        revision: computeRevision(files),
        files,
      }));
    }
    if (operations.length > MAX_OPERATIONS) {
      await writeSyncAuditLog(req, {
        gatewayId: syncCtx.gatewayId,
        userId: syncCtx.userId,
        method: "POST",
        outcome: "error",
        authMode: syncCtx.authMode,
        vaultPath,
        operations: operations.length,
        statusCode: 413,
        message: `Too many operations (max ${MAX_OPERATIONS})`,
      });
      return withCors(NextResponse.json(
        { error: `Too many operations (max ${MAX_OPERATIONS})` },
        { status: 413 },
      ));
    }

    let totalWriteBytes = 0;
    let applied = 0;

    for (const op of operations) {
      const relativePath = normalizeRelative(op.path || "");
      if (relativePath === null) {
        throw new GatewayError(400, `Invalid operation path: ${op.path}`);
      }
      const safePath = resolveWithinRoot(vaultRoot, relativePath || "");

      if (op.op === "mkdir") {
        await fs.mkdir(safePath, { recursive: true });
        applied += 1;
        continue;
      }

      if (op.op === "delete") {
        await fs.rm(safePath, { recursive: true, force: true });
        applied += 1;
        if (backupEnabled && relativePath) {
          try {
            await backupVaultEntryToConvex({
              gatewayId: syncCtx.gatewayId,
              vaultPath: vaultPath || DEFAULT_VAULT_PATH,
              relativePath,
              source: "sync_delete",
              deleted: true,
            });
            backedUp += 1;
          } catch (err: any) {
            backupErrors.push(err?.message || "backup-delete-failed");
            console.error("[obsidian-sync] Convex backup (delete) failed:", err);
          }
        }
        continue;
      }

      if (op.op === "upsert") {
        if (typeof op.content !== "string") {
          throw new GatewayError(400, `upsert requires string content for ${op.path}`);
        }
        const encoding = op.encoding === "base64" ? "base64" : "utf8";
        const buffer = Buffer.from(op.content, encoding);
        if (buffer.byteLength > MAX_SINGLE_FILE_BYTES) {
          throw new GatewayError(413, `File too large for ${op.path}`);
        }
        totalWriteBytes += buffer.byteLength;
        if (totalWriteBytes > MAX_WRITE_BYTES) {
          throw new GatewayError(413, `Write batch too large (max ${MAX_WRITE_BYTES} bytes)`);
        }
        await fs.mkdir(path.dirname(safePath), { recursive: true });
        await fs.writeFile(safePath, buffer);
        applied += 1;
        if (backupEnabled && relativePath) {
          try {
            await backupVaultEntryToConvex({
              gatewayId: syncCtx.gatewayId,
              vaultPath: vaultPath || DEFAULT_VAULT_PATH,
              relativePath,
              source: "sync_upsert",
              content: buffer,
            });
            backedUp += 1;
          } catch (err: any) {
            backupErrors.push(err?.message || "backup-upsert-failed");
            console.error("[obsidian-sync] Convex backup (upsert) failed:", err);
          }
        }
        continue;
      }

      throw new GatewayError(400, `Unsupported operation: ${String(op.op)}`);
    }

    const files = await listVaultFiles(vaultRoot);
    await writeSyncAuditLog(req, {
      gatewayId: syncCtx.gatewayId,
      userId: syncCtx.userId,
      method: "POST",
      outcome: "success",
      authMode: syncCtx.authMode,
      vaultPath,
      operations: operations.length,
      applied,
      message: backupEnabled
        ? `operations-applied (convex backup ${backedUp}/${operations.length}${backupErrors.length ? ", with backup errors" : ""})`
        : "operations-applied",
    });
    return withCors(NextResponse.json({
      ok: true,
      applied,
      presence: presenceState || undefined,
      backup: {
        enabled: backupEnabled,
        applied: backedUp,
        errors: backupErrors.length,
      },
      vaultPath,
      revision: computeRevision(files),
      files,
    }));
  } catch (err) {
    const statusCode = err instanceof GatewayError ? err.statusCode : 500;
    await writeSyncAuditLog(req, {
      gatewayId: syncCtx?.gatewayId,
      userId: syncCtx?.userId,
      method: "POST",
      outcome: "error",
      authMode: syncCtx?.authMode,
      vaultPath,
      operations: operationCount,
      statusCode,
      message: err instanceof Error ? err.message : "Unknown error",
    });
    return withCors(handleGatewayError(err));
  }
}
