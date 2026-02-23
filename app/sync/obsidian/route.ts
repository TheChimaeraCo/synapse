import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { createHash } from "crypto";
import { getGatewayContext, GatewayError, handleGatewayError } from "@/lib/gateway-context";
import { convexClient } from "@/lib/convex";
import { api } from "@/convex/_generated/api";
import { getWorkspacePath } from "@/lib/workspace";
import { extractBearerToken, safeEqualSecret } from "@/lib/security";
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

interface SyncContext {
  gatewayId: string;
  userId?: string;
  role?: "owner" | "admin" | "member" | "viewer" | string;
  authMode: "session" | "token";
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

async function resolveSyncContext(req: NextRequest, bodyGatewayId?: string): Promise<SyncContext> {
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
      || bodyGatewayId;
    if (!gatewayId) {
      throw new GatewayError(400, "gatewayId is required for token auth");
    }

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
): Promise<{ workspace: string; vaultRoot: string; vaultPath: string }> {
  const workspace = await getWorkspacePath(gatewayId);
  const configuredVaultPath = explicitVaultPath || DEFAULT_VAULT_PATH;
  const cleanVaultPath = normalizeRelative(configuredVaultPath);
  if (cleanVaultPath === null) throw new GatewayError(400, "Invalid vaultPath");
  const vaultPath = cleanVaultPath || DEFAULT_VAULT_PATH;
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

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const syncCtx = await resolveSyncContext(req);
    const stream = url.searchParams.get("stream") === "true";
    const pollMs = clampPollMs(url.searchParams.get("pollMs"));
    const filePath = url.searchParams.get("file");
    const encoding = url.searchParams.get("encoding") === "utf8" ? "utf8" : "base64";
    const { vaultRoot, vaultPath } = await resolveVaultRoot(
      syncCtx.gatewayId,
      url.searchParams.get("vaultPath"),
    );

    if (filePath) {
      const file = await readFileContent(vaultRoot, filePath, encoding);
      return NextResponse.json({
        vaultPath,
        filePath: normalizeRelative(filePath),
        ...file,
      });
    }

    if (!stream) {
      const files = await listVaultFiles(vaultRoot);
      return NextResponse.json({
        vaultPath,
        revision: computeRevision(files),
        files,
      });
    }

    const encoder = new TextEncoder();
    const streamBody = new ReadableStream({
      async start(controller) {
        let lastFiles: VaultFileMeta[] = [];
        let running = false;

        const push = (data: unknown) => {
          controller.enqueue(encoder.encode(ssePayload(data)));
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
            authMode: syncCtx.authMode,
            ts: Date.now(),
          });
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
          try {
            controller.close();
          } catch {}
        };
        req.signal.addEventListener("abort", abortHandler);
      },
    });

    return new Response(streamBody, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (err) {
    return handleGatewayError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    let body: {
      gatewayId?: string;
      vaultPath?: string;
      operations?: ObsidianOperation[];
    } = {};
    try {
      body = (rawBody ? JSON.parse(rawBody) : {}) as {
        gatewayId?: string;
        vaultPath?: string;
        operations?: ObsidianOperation[];
      };
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    const syncCtx = await resolveSyncContext(req, body.gatewayId);
    ensureWriteAllowed(syncCtx);
    const { vaultRoot, vaultPath } = await resolveVaultRoot(syncCtx.gatewayId, body.vaultPath);
    const operations = Array.isArray(body.operations) ? body.operations : [];

    if (operations.length === 0) {
      const files = await listVaultFiles(vaultRoot);
      return NextResponse.json({
        ok: true,
        applied: 0,
        vaultPath,
        revision: computeRevision(files),
        files,
      });
    }
    if (operations.length > MAX_OPERATIONS) {
      return NextResponse.json(
        { error: `Too many operations (max ${MAX_OPERATIONS})` },
        { status: 413 },
      );
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
        continue;
      }

      throw new GatewayError(400, `Unsupported operation: ${String(op.op)}`);
    }

    const files = await listVaultFiles(vaultRoot);
    return NextResponse.json({
      ok: true,
      applied,
      vaultPath,
      revision: computeRevision(files),
      files,
    });
  } catch (err) {
    return handleGatewayError(err);
  }
}
