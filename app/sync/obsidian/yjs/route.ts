import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { GatewayError, getGatewayContext, handleGatewayError } from "@/lib/gateway-context";
import { convexClient } from "@/lib/convex";
import { api } from "@/convex/_generated/api";
import { extractBearerToken, safeEqualSecret } from "@/lib/security";
import { getWorkspacePath } from "@/lib/workspace";
import {
  applyYjsUpdate,
  ensureYjsTextInitialized,
  encodeYjsMissingUpdate,
  encodeYjsStateVector,
  getYjsTextContent,
  isYjsLiveMode,
  listYjsPresence,
  removeYjsPresence,
  upsertYjsPresence,
} from "@/lib/obsidianYjs";
import {
  matchVaultKey,
  normalizeVaultPath,
  OBSIDIAN_VAULTS_CONFIG_KEY,
  parseVaults,
  serializeVaults,
} from "@/lib/obsidianVaults";
import type { Id } from "@/convex/_generated/dataModel";

export const runtime = "nodejs";

const MAX_UPDATE_BYTES = 8 * 1024 * 1024;
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

interface CursorPayload {
  line?: unknown;
  ch?: unknown;
  anchorLine?: unknown;
  anchorCh?: unknown;
  headLine?: unknown;
  headCh?: unknown;
}

interface PresencePayload {
  clientId?: string;
  clientName?: string;
  activeFile?: string;
  cursor?: CursorPayload;
  isTyping?: boolean;
  offline?: boolean;
}

function withCors(response: NextResponse | Response): NextResponse | Response {
  Object.entries(CORS_HEADERS).forEach(([key, value]) => {
    response.headers.set(key, value);
  });
  return response;
}

function cleanString(value: unknown, maxLen = 512): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maxLen);
}

function normalizeDocPath(value: string): string {
  const normalized = cleanString(value, 1024).replace(/\\/g, "/").replace(/^\/+/, "");
  if (!normalized) throw new GatewayError(400, "docPath is required");
  const parts = normalized.split("/").filter(Boolean);
  if (parts.length === 0 || parts.some((part) => part === "..")) {
    throw new GatewayError(400, "Invalid docPath");
  }
  return parts.join("/");
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

function normalizePresenceCursor(cursor?: CursorPayload): {
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

function normalizePresenceActiveFile(value?: string): string | undefined {
  const cleaned = cleanString(value || "", 1024);
  if (!cleaned) return undefined;
  const normalized = cleaned.replace(/\\/g, "/").replace(/^\/+/, "");
  if (!normalized) return undefined;
  const parts = normalized.split("/").filter(Boolean);
  if (parts.some((part) => part === "..")) return undefined;
  return parts.join("/");
}

function decodeBase64Bytes(value: string, fieldName: string): Uint8Array {
  const raw = cleanString(value, 1024 * 1024 * 4);
  if (!raw) return new Uint8Array();
  let buffer: Buffer;
  try {
    buffer = Buffer.from(raw, "base64");
  } catch {
    throw new GatewayError(400, `${fieldName} must be valid base64`);
  }
  if (!buffer || buffer.length === 0) {
    throw new GatewayError(400, `${fieldName} is empty or invalid`);
  }
  if (buffer.length > MAX_UPDATE_BYTES) {
    throw new GatewayError(413, `${fieldName} too large`);
  }
  return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
}

function encodeBase64Bytes(value: Uint8Array): string {
  if (!value || value.length === 0) return "";
  return Buffer.from(value).toString("base64");
}

async function getGatewayAuthToken(gatewayId: string): Promise<string> {
  try {
    const row = await convexClient.query(api.functions.gatewayConfig.getWithInheritance, {
      gatewayId: gatewayId as Id<"gateways">,
      key: "gateway.auth_token",
    });
    if (row?.value) return row.value;
  } catch {}
  try {
    const globalValue = await convexClient.query(api.functions.config.get, { key: "gateway.auth_token" });
    return globalValue || "";
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
    const session = await getGatewayContext(req);
    return {
      gatewayId: session.gatewayId,
      userId: session.userId,
      role: session.role,
      authMode: "session",
    };
  } catch (sessionErr) {
    const token = extractBearerToken(req.headers.get("authorization"));
    if (!token) throw sessionErr;
    const url = new URL(req.url);
    const gatewayId = req.headers.get("X-Gateway-Id")
      || url.searchParams.get("gatewayId")
      || opts?.gatewayId;
    if (!gatewayId) throw new GatewayError(400, "gatewayId is required for token auth");
    const requestedVaultPath = opts?.vaultPath || url.searchParams.get("vaultPath");

    const vaults = await getObsidianVaults(gatewayId);
    const match = matchVaultKey(vaults, token, requestedVaultPath);
    if (match) {
      void touchVaultKeyLastUsed(gatewayId, match.vault.id, match.key.id);
      return { gatewayId, authMode: "token", vaultPathScope: match.vault.path };
    }

    const expected = await getGatewayAuthToken(gatewayId);
    if (!expected || !safeEqualSecret(token, expected)) {
      throw new GatewayError(403, "Invalid gateway auth token");
    }
    return { gatewayId, authMode: "token" };
  }
}

function resolveVaultPath(explicitVaultPath?: string | null, scopedVaultPath?: string): string {
  const requested = explicitVaultPath || scopedVaultPath || "obsidian-vault";
  const normalized = normalizeVaultPath(requested);
  if (scopedVaultPath && normalized !== scopedVaultPath) {
    throw new GatewayError(403, "Token is scoped to a different vault path");
  }
  return normalized;
}

async function resolveVaultRoot(gatewayId: string, vaultPath: string): Promise<string> {
  const workspace = await getWorkspacePath(gatewayId);
  const root = resolveWithinRoot(workspace, vaultPath);
  await fs.mkdir(root, { recursive: true });
  return root;
}

function buildDocRelativePath(docPath: string): string {
  const normalized = normalizeDocPath(docPath);
  if (!normalized) throw new GatewayError(400, "docPath is required");
  return normalized;
}

async function hydrateDocFromFileIfNeeded(args: {
  gatewayId: string;
  vaultPath: string;
  docPath: string;
}): Promise<void> {
  const vaultRoot = await resolveVaultRoot(args.gatewayId, args.vaultPath);
  const fileAbs = resolveWithinRoot(vaultRoot, buildDocRelativePath(args.docPath));
  try {
    const stat = await fs.stat(fileAbs);
    if (!stat.isFile()) return;
    const content = await fs.readFile(fileAbs, "utf8");
    ensureYjsTextInitialized({
      gatewayId: args.gatewayId,
      vaultPath: args.vaultPath,
      docPath: args.docPath,
      content,
    });
  } catch {
    return;
  }
}

async function persistDocToFile(args: {
  gatewayId: string;
  vaultPath: string;
  docPath: string;
}): Promise<void> {
  const vaultRoot = await resolveVaultRoot(args.gatewayId, args.vaultPath);
  const fileAbs = resolveWithinRoot(vaultRoot, buildDocRelativePath(args.docPath));
  const nextText = getYjsTextContent({
    gatewayId: args.gatewayId,
    vaultPath: args.vaultPath,
    docPath: args.docPath,
  });
  await fs.mkdir(path.dirname(fileAbs), { recursive: true });
  await fs.writeFile(fileAbs, nextText, "utf8");
}

async function writeAuditLog(req: NextRequest, payload: {
  gatewayId?: string;
  userId?: string;
  outcome: "success" | "error";
  message?: string;
  statusCode?: number;
  vaultPath?: string;
  docPath?: string;
  authMode?: "session" | "token";
}): Promise<void> {
  try {
    const forwarded = req.headers.get("x-forwarded-for");
    const ip = forwarded ? forwarded.split(",")[0]?.trim() : (req.headers.get("x-real-ip") || undefined);
    await convexClient.mutation(api.functions.auditLog.log, {
      userId: payload.userId ? (payload.userId as Id<"authUsers">) : undefined,
      action: `sync.obsidian.yjs.${payload.outcome}`,
      resource: "obsidian_yjs",
      resourceId: payload.gatewayId,
      ip,
      details: JSON.stringify({
        message: payload.message,
        statusCode: payload.statusCode,
        vaultPath: payload.vaultPath,
        docPath: payload.docPath,
        authMode: payload.authMode,
      }),
    });
  } catch {}
}

function upsertPresence(args: {
  gatewayId: string;
  vaultPath: string;
  docPath: string;
  presence?: PresencePayload;
}) {
  const clientId = cleanString(args.presence?.clientId || "", 96);
  if (!clientId) {
    return listYjsPresence({
      gatewayId: args.gatewayId,
      vaultPath: args.vaultPath,
      docPath: args.docPath,
    });
  }
  if (args.presence?.offline) {
    return removeYjsPresence({
      gatewayId: args.gatewayId,
      vaultPath: args.vaultPath,
      docPath: args.docPath,
      clientId,
    });
  }
  return upsertYjsPresence({
    gatewayId: args.gatewayId,
    vaultPath: args.vaultPath,
    docPath: args.docPath,
    clientId,
    name: cleanString(args.presence?.clientName || "", 80) || "Obsidian User",
    activeFile: normalizePresenceActiveFile(args.presence?.activeFile),
    cursor: normalizePresenceCursor(args.presence?.cursor),
    isTyping: Boolean(args.presence?.isTyping),
  });
}

export async function OPTIONS() {
  return withCors(new NextResponse(null, { status: 204 }));
}

export async function GET(req: NextRequest) {
  let syncCtx: SyncContext | undefined;
  let vaultPath: string | undefined;
  let docPath: string | undefined;
  try {
    const url = new URL(req.url);
    const gatewayId = cleanString(url.searchParams.get("gatewayId") || "");
    const requestedVaultPath = cleanString(url.searchParams.get("vaultPath") || "");
    syncCtx = await resolveSyncContext(req, {
      gatewayId: gatewayId || undefined,
      vaultPath: requestedVaultPath || undefined,
    });
    vaultPath = resolveVaultPath(requestedVaultPath || undefined, syncCtx.vaultPathScope);
    docPath = normalizeDocPath(cleanString(url.searchParams.get("docPath") || "", 1024));
    await hydrateDocFromFileIfNeeded({
      gatewayId: syncCtx.gatewayId,
      vaultPath,
      docPath,
    });
    const stateVectorB64 = cleanString(url.searchParams.get("stateVector") || "", 1024 * 1024 * 2);
    const stateVector = stateVectorB64 ? decodeBase64Bytes(stateVectorB64, "stateVector") : undefined;
    const participants = upsertPresence({
      gatewayId: syncCtx.gatewayId,
      vaultPath,
      docPath,
      presence: {
        clientId: cleanString(url.searchParams.get("clientId") || "", 96),
        clientName: cleanString(url.searchParams.get("clientName") || "", 80),
        activeFile: cleanString(url.searchParams.get("activeFile") || "", 1024),
        isTyping: false,
      },
    });

    const serverUpdate = encodeYjsMissingUpdate({
      gatewayId: syncCtx.gatewayId,
      vaultPath,
      docPath,
      stateVector,
    });
    const serverVector = encodeYjsStateVector({
      gatewayId: syncCtx.gatewayId,
      vaultPath,
      docPath,
    });

    await writeAuditLog(req, {
      gatewayId: syncCtx.gatewayId,
      userId: syncCtx.userId,
      outcome: "success",
      message: "yjs-get",
      vaultPath,
      docPath,
      authMode: syncCtx.authMode,
    });

    return withCors(NextResponse.json({
      ok: true,
      gatewayId: syncCtx.gatewayId,
      vaultPath,
      docPath,
      serverUpdate: encodeBase64Bytes(serverUpdate),
      stateVector: encodeBase64Bytes(serverVector),
      participants,
      liveMode: isYjsLiveMode(participants),
    }));
  } catch (err) {
    const statusCode = err instanceof GatewayError ? err.statusCode : 500;
    await writeAuditLog(req, {
      gatewayId: syncCtx?.gatewayId,
      userId: syncCtx?.userId,
      outcome: "error",
      message: err instanceof Error ? err.message : "unknown",
      statusCode,
      vaultPath,
      docPath,
      authMode: syncCtx?.authMode,
    });
    return withCors(handleGatewayError(err));
  }
}

export async function POST(req: NextRequest) {
  let syncCtx: SyncContext | undefined;
  let vaultPath: string | undefined;
  let docPath: string | undefined;
  try {
    const body = (await req.json().catch(() => ({}))) as {
      gatewayId?: string;
      vaultPath?: string;
      docPath?: string;
      update?: string;
      stateVector?: string;
      presence?: PresencePayload;
    };
    syncCtx = await resolveSyncContext(req, {
      gatewayId: cleanString(body.gatewayId || ""),
      vaultPath: cleanString(body.vaultPath || ""),
    });
    vaultPath = resolveVaultPath(cleanString(body.vaultPath || ""), syncCtx.vaultPathScope);
    docPath = normalizeDocPath(cleanString(body.docPath || "", 1024));
    await hydrateDocFromFileIfNeeded({
      gatewayId: syncCtx.gatewayId,
      vaultPath,
      docPath,
    });

    const incomingUpdate = cleanString(body.update || "", 1024 * 1024 * 8);
    if (incomingUpdate) {
      const updateBytes = decodeBase64Bytes(incomingUpdate, "update");
      applyYjsUpdate({
        gatewayId: syncCtx.gatewayId,
        vaultPath,
        docPath,
        update: updateBytes,
      });
      await persistDocToFile({
        gatewayId: syncCtx.gatewayId,
        vaultPath,
        docPath,
      });
    }

    const participants = upsertPresence({
      gatewayId: syncCtx.gatewayId,
      vaultPath,
      docPath,
      presence: body.presence,
    });

    const stateVector = body.stateVector
      ? decodeBase64Bytes(body.stateVector, "stateVector")
      : undefined;
    const serverUpdate = encodeYjsMissingUpdate({
      gatewayId: syncCtx.gatewayId,
      vaultPath,
      docPath,
      stateVector,
    });
    const serverVector = encodeYjsStateVector({
      gatewayId: syncCtx.gatewayId,
      vaultPath,
      docPath,
    });

    await writeAuditLog(req, {
      gatewayId: syncCtx.gatewayId,
      userId: syncCtx.userId,
      outcome: "success",
      message: incomingUpdate ? "yjs-post-update" : "yjs-post-sync",
      vaultPath,
      docPath,
      authMode: syncCtx.authMode,
    });

    return withCors(NextResponse.json({
      ok: true,
      gatewayId: syncCtx.gatewayId,
      vaultPath,
      docPath,
      serverUpdate: encodeBase64Bytes(serverUpdate),
      stateVector: encodeBase64Bytes(serverVector),
      participants,
      liveMode: isYjsLiveMode(participants),
    }));
  } catch (err) {
    const statusCode = err instanceof GatewayError ? err.statusCode : 500;
    await writeAuditLog(req, {
      gatewayId: syncCtx?.gatewayId,
      userId: syncCtx?.userId,
      outcome: "error",
      message: err instanceof Error ? err.message : "unknown",
      statusCode,
      vaultPath,
      docPath,
      authMode: syncCtx?.authMode,
    });
    return withCors(handleGatewayError(err));
  }
}
