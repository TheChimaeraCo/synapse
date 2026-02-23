import { NextRequest, NextResponse } from "next/server";
import { convexClient } from "@/lib/convex";
import { api } from "@/convex/_generated/api";
import { safeEqualSecret } from "@/lib/security";
import type { Id } from "@/convex/_generated/dataModel";

export const runtime = "nodejs";

const HOP_BY_HOP_HEADERS = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailers",
  "transfer-encoding",
  "upgrade",
]);

interface LiveSyncProxyConfig {
  enabled: boolean;
  couchdbUrl: string;
  proxyUsername: string;
  proxyPassword: string;
  upstreamUsername: string;
  upstreamPassword: string;
}

function clean(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim();
}

function parseBasicAuth(headerValue: string | null): { username: string; password: string } | null {
  if (!headerValue || !/^Basic\s+/i.test(headerValue)) return null;
  const encoded = headerValue.replace(/^Basic\s+/i, "").trim();
  try {
    const decoded = Buffer.from(encoded, "base64").toString("utf8");
    const idx = decoded.indexOf(":");
    if (idx < 0) return null;
    return {
      username: decoded.slice(0, idx),
      password: decoded.slice(idx + 1),
    };
  } catch {
    return null;
  }
}

function buildBasicAuthHeader(username: string, password: string): string {
  return `Basic ${Buffer.from(`${username}:${password}`, "utf8").toString("base64")}`;
}

function withCors(headers: Headers): Headers {
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,HEAD,OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Authorization,Content-Type,Accept,If-None-Match");
  return headers;
}

function unauthorizedResponse(): NextResponse {
  const headers = new Headers({
    "WWW-Authenticate": 'Basic realm="Synapse Obsidian LiveSync", charset="UTF-8"',
  });
  withCors(headers);
  return new NextResponse("Unauthorized", { status: 401, headers });
}

async function loadProxyConfig(gatewayId: string): Promise<LiveSyncProxyConfig> {
  const keys = [
    "sync.obsidian.livesync.enabled",
    "sync.obsidian.livesync.couchdb_url",
    "sync.obsidian.livesync.username",
    "sync.obsidian.livesync.password",
    "sync.obsidian.livesync.upstream_username",
    "sync.obsidian.livesync.upstream_password",
  ];

  let values: Record<string, string> = {};
  try {
    values = await convexClient.query(api.functions.gatewayConfig.getMultiple, {
      gatewayId: gatewayId as Id<"gateways">,
      keys,
    });
  } catch {
    values = await convexClient.query(api.functions.config.getMultiple, { keys });
  }

  const enabledRaw = clean(values["sync.obsidian.livesync.enabled"]).toLowerCase();
  const enabled = enabledRaw === "true";
  const couchdbUrl = clean(values["sync.obsidian.livesync.couchdb_url"]) || clean(process.env.OBSIDIAN_LIVESYNC_COUCHDB_URL);
  const proxyUsername = clean(values["sync.obsidian.livesync.username"]) || clean(process.env.OBSIDIAN_LIVESYNC_USERNAME);
  const proxyPassword = clean(values["sync.obsidian.livesync.password"]) || clean(process.env.OBSIDIAN_LIVESYNC_PASSWORD);
  const upstreamUsername = clean(values["sync.obsidian.livesync.upstream_username"]) || clean(process.env.OBSIDIAN_LIVESYNC_UPSTREAM_USERNAME);
  const upstreamPassword = clean(values["sync.obsidian.livesync.upstream_password"]) || clean(process.env.OBSIDIAN_LIVESYNC_UPSTREAM_PASSWORD);

  return {
    enabled,
    couchdbUrl,
    proxyUsername,
    proxyPassword,
    upstreamUsername,
    upstreamPassword,
  };
}

function ensureHttpUrl(value: string): URL {
  const parsed = new URL(value);
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("sync.obsidian.livesync.couchdb_url must be http(s)");
  }
  return parsed;
}

function buildUpstreamUrl(base: URL, subPath: string[], searchParams: URLSearchParams): string {
  const upstream = new URL(base.toString());
  const currentPath = upstream.pathname.replace(/\/+$/, "");
  const appendPath = subPath.length > 0 ? `/${subPath.join("/")}` : "";
  upstream.pathname = `${currentPath}${appendPath}` || "/";
  upstream.search = searchParams.toString();
  return upstream.toString();
}

async function proxyToCouchdb(
  req: NextRequest,
  params: { gatewaySlug: string; path?: string[] },
): Promise<Response> {
  const gateway = await convexClient.query(api.functions.gateways.getBySlug, { slug: params.gatewaySlug });
  if (!gateway) {
    return NextResponse.json({ error: "Gateway not found" }, { status: 404 });
  }

  const cfg = await loadProxyConfig(String(gateway._id));
  if (!cfg.enabled) {
    return NextResponse.json({ error: "Obsidian LiveSync proxy is disabled" }, { status: 403 });
  }
  if (!cfg.couchdbUrl) {
    return NextResponse.json({ error: "sync.obsidian.livesync.couchdb_url is not configured" }, { status: 503 });
  }
  if (!cfg.proxyUsername || !cfg.proxyPassword) {
    return NextResponse.json({ error: "LiveSync proxy username/password is not configured" }, { status: 503 });
  }

  const incoming = parseBasicAuth(req.headers.get("authorization"));
  if (!incoming) return unauthorizedResponse();

  const userOk = safeEqualSecret(incoming.username, cfg.proxyUsername);
  const passOk = safeEqualSecret(incoming.password, cfg.proxyPassword);
  if (!userOk || !passOk) return unauthorizedResponse();

  const upstreamBase = ensureHttpUrl(cfg.couchdbUrl);
  const upstreamPath = params.path || [];
  const upstreamUrl = buildUpstreamUrl(upstreamBase, upstreamPath, new URL(req.url).searchParams);

  const upstreamHeaders = new Headers();
  for (const [key, value] of req.headers.entries()) {
    const lower = key.toLowerCase();
    if (HOP_BY_HOP_HEADERS.has(lower)) continue;
    if (lower === "host") continue;
    if (lower === "authorization") continue;
    upstreamHeaders.set(key, value);
  }

  const upstreamAuthUser = cfg.upstreamUsername || cfg.proxyUsername;
  const upstreamAuthPass = cfg.upstreamPassword || cfg.proxyPassword;
  upstreamHeaders.set("Authorization", buildBasicAuthHeader(upstreamAuthUser, upstreamAuthPass));

  const method = req.method.toUpperCase();
  const bodyAllowed = !["GET", "HEAD"].includes(method);
  const requestBody = bodyAllowed ? Buffer.from(await req.arrayBuffer()) : undefined;

  const upstreamRes = await fetch(upstreamUrl, {
    method,
    headers: upstreamHeaders,
    body: requestBody,
    redirect: "manual",
  });

  const responseHeaders = new Headers();
  for (const [key, value] of upstreamRes.headers.entries()) {
    if (HOP_BY_HOP_HEADERS.has(key.toLowerCase())) continue;
    responseHeaders.set(key, value);
  }
  withCors(responseHeaders);

  return new Response(upstreamRes.body, {
    status: upstreamRes.status,
    statusText: upstreamRes.statusText,
    headers: responseHeaders,
  });
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: withCors(new Headers()) });
}

async function handleMethod(
  req: NextRequest,
  context: { params: Promise<{ gatewaySlug: string; path?: string[] }> },
) {
  try {
    const params = await context.params;
    return await proxyToCouchdb(req, params);
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "LiveSync proxy error" },
      { status: 500, headers: withCors(new Headers()) },
    );
  }
}

export async function GET(req: NextRequest, context: { params: Promise<{ gatewaySlug: string; path?: string[] }> }) {
  return handleMethod(req, context);
}

export async function POST(req: NextRequest, context: { params: Promise<{ gatewaySlug: string; path?: string[] }> }) {
  return handleMethod(req, context);
}

export async function PUT(req: NextRequest, context: { params: Promise<{ gatewaySlug: string; path?: string[] }> }) {
  return handleMethod(req, context);
}

export async function PATCH(req: NextRequest, context: { params: Promise<{ gatewaySlug: string; path?: string[] }> }) {
  return handleMethod(req, context);
}

export async function DELETE(req: NextRequest, context: { params: Promise<{ gatewaySlug: string; path?: string[] }> }) {
  return handleMethod(req, context);
}

export async function HEAD(req: NextRequest, context: { params: Promise<{ gatewaySlug: string; path?: string[] }> }) {
  return handleMethod(req, context);
}

