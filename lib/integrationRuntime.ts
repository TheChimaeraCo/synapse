import { convexClient } from "@/lib/convex";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

type IntegrationAuthType = "none" | "bearer" | "header" | "query" | "basic";

export interface DiscoveredEndpoint {
  name: string;
  method: string;
  path: string;
  description?: string;
  source?: string;
}

function cleanSegment(value: string): string {
  return (value || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

export function slugify(value: string): string {
  return cleanSegment(value) || `integration-${Date.now().toString(36)}`;
}

export function buildToolName(integrationSlug: string, endpointSlug: string): string {
  return `${cleanSegment(integrationSlug)}.${cleanSegment(endpointSlug)}`;
}

export function defaultEndpointArgsSchema() {
  return {
    type: "object",
    description:
      "Optional request overrides. Use path/query/body to pass endpoint-specific values.",
    properties: {
      path: {
        type: "object",
        description: "Path params for placeholders like {id}",
        additionalProperties: true,
      },
      query: {
        type: "object",
        description: "Query params to append to URL",
        additionalProperties: true,
      },
      body: {
        description: "JSON or string body for POST/PUT/PATCH/DELETE requests",
      },
      headers: {
        type: "object",
        description: "Additional headers to include in request",
        additionalProperties: true,
      },
    },
    additionalProperties: true,
  };
}

export function buildIntegrationToolHandlerCode(integrationSlug: string, endpointSlug: string): string {
  return `return await integrationCall("${integrationSlug}", "${endpointSlug}", args);`;
}

function stringifyBody(body: any): { payload?: string; contentType?: string } {
  if (body === null || body === undefined) return {};
  if (typeof body === "string") return { payload: body };
  return { payload: JSON.stringify(body), contentType: "application/json" };
}

function isObject(value: any): value is Record<string, any> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function interpolatePath(template: string, args: Record<string, any>): string {
  const pathParams = isObject(args.path) ? args.path : {};
  return String(template || "")
    .replace(/\{([^}]+)\}/g, (_, key) => {
      const v = pathParams[key] ?? args[key];
      if (v === null || v === undefined) return `{${key}}`;
      return encodeURIComponent(String(v));
    });
}

function applyQuery(url: URL, integrationQueryTemplate: any, args: Record<string, any>) {
  if (isObject(integrationQueryTemplate)) {
    for (const [key, value] of Object.entries(integrationQueryTemplate)) {
      if (value === null || value === undefined || value === "") continue;
      url.searchParams.set(key, String(value));
    }
  }
  if (isObject(args.query)) {
    for (const [key, value] of Object.entries(args.query)) {
      if (value === null || value === undefined || value === "") continue;
      url.searchParams.set(key, String(value));
    }
  }
}

function basicAuthValue(username: string, password: string): string {
  return Buffer.from(`${username}:${password}`, "utf8").toString("base64");
}

function parseAuthConfig(authConfig: any): {
  headerName: string;
  queryName: string;
  username: string;
} {
  if (!isObject(authConfig)) {
    return { headerName: "X-API-Key", queryName: "api_key", username: "" };
  }
  return {
    headerName: String(authConfig.headerName || "X-API-Key"),
    queryName: String(authConfig.queryName || "api_key"),
    username: String(authConfig.username || ""),
  };
}

async function getSecretValue(gatewayId: Id<"gateways">, key: string): Promise<string> {
  const row = await convexClient.query(api.functions.gatewayConfig.getWithInheritance, { gatewayId, key });
  return row?.value || "";
}

function isPrivateIp(hostname: string): boolean {
  const lower = hostname.toLowerCase();
  if (lower === "localhost" || lower === "127.0.0.1" || lower === "::1") return true;
  if (/^10\./.test(lower)) return true;
  if (/^192\.168\./.test(lower)) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(lower)) return true;
  if (/^169\.254\./.test(lower)) return true;
  if (lower.startsWith("fc") || lower.startsWith("fd") || lower.startsWith("fe80:")) return true;
  return false;
}

async function assertAllowedHost(url: URL, allowPrivateNetwork?: boolean) {
  if (allowPrivateNetwork) return;
  if (isPrivateIp(url.hostname)) {
    throw new Error("Private network hosts are blocked for this integration.");
  }
}

function normalizeMethod(method: string): string {
  const m = String(method || "").trim().toUpperCase();
  if (!m) return "GET";
  return m;
}

function normalizePath(path: string): string {
  const value = String(path || "").trim();
  if (!value) return "/";
  return value.startsWith("/") ? value : `/${value}`;
}

function uniqByMethodPath(list: DiscoveredEndpoint[]): DiscoveredEndpoint[] {
  const seen = new Set<string>();
  const out: DiscoveredEndpoint[] = [];
  for (const row of list) {
    const key = `${normalizeMethod(row.method)} ${normalizePath(row.path)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      ...row,
      method: normalizeMethod(row.method),
      path: normalizePath(row.path),
    });
  }
  return out;
}

function endpointNameFromPath(method: string, path: string): string {
  const clean = normalizePath(path).replace(/[{}]/g, "");
  const segments = clean.split("/").filter(Boolean).slice(0, 4);
  const label = segments.join(" ");
  return `${normalizeMethod(method)} ${label || "root"}`.trim();
}

function extractOpenApiEndpoints(doc: any, source?: string): DiscoveredEndpoint[] {
  if (!doc || typeof doc !== "object") return [];
  const paths = doc.paths;
  if (!paths || typeof paths !== "object") return [];

  const methods = ["get", "post", "put", "patch", "delete", "options", "head"];
  const out: DiscoveredEndpoint[] = [];

  for (const [path, config] of Object.entries(paths)) {
    if (!config || typeof config !== "object") continue;
    for (const method of methods) {
      const def = (config as any)[method];
      if (!def || typeof def !== "object") continue;
      out.push({
        name: String(def.operationId || def.summary || endpointNameFromPath(method, path)),
        method: method.toUpperCase(),
        path: normalizePath(path),
        description: String(def.description || def.summary || ""),
        source,
      });
    }
  }
  return out;
}

function extractRegexEndpoints(text: string, source?: string): DiscoveredEndpoint[] {
  const lines = String(text || "").split(/\r?\n/).slice(0, 3000);
  const re = /\b(GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD)\s+((?:\/|https?:\/\/)[A-Za-z0-9\-._~:/?#\[\]@!$&'()*+,;=%{}]+)\b/gi;
  const out: DiscoveredEndpoint[] = [];

  for (const line of lines) {
    let match: RegExpExecArray | null;
    while ((match = re.exec(line)) !== null) {
      const method = normalizeMethod(match[1]);
      let rawPath = match[2];
      try {
        if (rawPath.startsWith("http://") || rawPath.startsWith("https://")) {
          rawPath = new URL(rawPath).pathname || "/";
        }
      } catch {}
      const path = normalizePath(rawPath);
      out.push({
        name: endpointNameFromPath(method, path),
        method,
        path,
        description: line.trim().slice(0, 220),
        source,
      });
    }
  }

  return out;
}

async function fetchWithTimeout(url: string, timeoutMs = 12000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export async function discoverIntegrationEndpoints(opts: {
  baseUrl?: string;
  docsUrl?: string;
  allowPrivateNetwork?: boolean;
  maxEndpoints?: number;
}): Promise<DiscoveredEndpoint[]> {
  const max = Math.max(1, Math.min(100, Number(opts.maxEndpoints || 40)));
  const urls: Array<{ url: string; source: string }> = [];
  const docsUrl = String(opts.docsUrl || "").trim();
  const baseUrl = String(opts.baseUrl || "").trim().replace(/\/+$/, "");

  if (docsUrl) urls.push({ url: docsUrl, source: "docs_url" });
  if (baseUrl) {
    urls.push({ url: `${baseUrl}/openapi.json`, source: "openapi.json" });
    urls.push({ url: `${baseUrl}/swagger.json`, source: "swagger.json" });
    urls.push({ url: `${baseUrl}/v3/api-docs`, source: "v3/api-docs" });
  }

  const discovered: DiscoveredEndpoint[] = [];
  const seenUrl = new Set<string>();

  for (const candidate of urls) {
    if (!candidate.url || seenUrl.has(candidate.url)) continue;
    seenUrl.add(candidate.url);
    let parsed: URL;
    try {
      parsed = new URL(candidate.url);
    } catch {
      continue;
    }
    await assertAllowedHost(parsed, opts.allowPrivateNetwork);

    try {
      const res = await fetchWithTimeout(parsed.toString(), 12000);
      if (!res.ok) continue;
      const contentType = (res.headers.get("content-type") || "").toLowerCase();
      if (contentType.includes("json")) {
        const json = await res.json().catch(() => null);
        if (json) discovered.push(...extractOpenApiEndpoints(json, candidate.source));
        continue;
      }
      const text = await res.text();
      if (text) {
        // Try JSON parse even if content type is incorrect.
        try {
          const json = JSON.parse(text);
          discovered.push(...extractOpenApiEndpoints(json, candidate.source));
        } catch {
          discovered.push(...extractRegexEndpoints(text, candidate.source));
        }
      }
    } catch {
      continue;
    }
  }

  return uniqByMethodPath(discovered).slice(0, max);
}

export async function executeIntegrationEndpointByToolName(params: {
  gatewayId: Id<"gateways">;
  toolName: string;
  args: Record<string, any>;
}): Promise<string> {
  const resolved = await convexClient.query(api.functions.integrations.getByToolName, {
    gatewayId: params.gatewayId,
    toolName: params.toolName,
  });
  if (!resolved) throw new Error(`Integration endpoint not found for tool "${params.toolName}"`);
  return await executeIntegrationEndpoint({
    gatewayId: params.gatewayId,
    integration: resolved.integration as any,
    endpoint: resolved.endpoint as any,
    args: params.args,
  });
}

export async function executeIntegrationEndpointBySlugs(params: {
  gatewayId: Id<"gateways">;
  integrationSlug: string;
  endpointSlug: string;
  args: Record<string, any>;
}): Promise<string> {
  const resolved = await convexClient.query(api.functions.integrations.getBySlugs, {
    gatewayId: params.gatewayId,
    integrationSlug: params.integrationSlug,
    endpointSlug: params.endpointSlug,
  });
  if (!resolved) {
    throw new Error(`Integration endpoint not found: ${params.integrationSlug}/${params.endpointSlug}`);
  }
  return await executeIntegrationEndpoint({
    gatewayId: params.gatewayId,
    integration: resolved.integration as any,
    endpoint: resolved.endpoint as any,
    args: params.args,
  });
}

export async function executeIntegrationEndpoint(params: {
  gatewayId: Id<"gateways">;
  integration: any;
  endpoint: any;
  args: Record<string, any>;
}): Promise<string> {
  const { gatewayId, integration, endpoint, args } = params;
  if (!integration.enabled) throw new Error(`Integration "${integration.name}" is disabled.`);
  if (!endpoint.enabled) throw new Error(`Endpoint "${endpoint.name}" is disabled.`);

  const method = String(endpoint.method || "GET").toUpperCase();
  const base = String(integration.baseUrl || "").replace(/\/+$/, "");
  const path = interpolatePath(String(endpoint.path || "/"), args || {});
  const pathWithPrefix = path.startsWith("/") ? path : `/${path}`;
  const url = new URL(`${base}${pathWithPrefix}`);
  await assertAllowedHost(url, integration.allowPrivateNetwork);

  applyQuery(url, endpoint.queryTemplate, args || {});
  const headers: Record<string, string> = {};

  if (isObject(endpoint.headers)) {
    for (const [key, value] of Object.entries(endpoint.headers)) {
      if (value === null || value === undefined || value === "") continue;
      headers[key] = String(value);
    }
  }
  if (isObject(args.headers)) {
    for (const [key, value] of Object.entries(args.headers)) {
      if (value === null || value === undefined || value === "") continue;
      headers[key] = String(value);
    }
  }

  const authType = integration.authType as IntegrationAuthType;
  const authCfg = parseAuthConfig(integration.authConfig);
  const secretPrefix = `integration.${integration._id}.secret`;

  if (authType === "bearer") {
    const token = await getSecretValue(gatewayId, `${secretPrefix}.token`);
    if (!token) throw new Error(`Missing bearer token for integration "${integration.name}"`);
    headers.Authorization = `Bearer ${token}`;
  } else if (authType === "header") {
    const value = await getSecretValue(gatewayId, `${secretPrefix}.value`);
    if (!value) throw new Error(`Missing API key/header value for integration "${integration.name}"`);
    headers[authCfg.headerName || "X-API-Key"] = value;
  } else if (authType === "query") {
    const value = await getSecretValue(gatewayId, `${secretPrefix}.value`);
    if (!value) throw new Error(`Missing query auth value for integration "${integration.name}"`);
    url.searchParams.set(authCfg.queryName || "api_key", value);
  } else if (authType === "basic") {
    const password = await getSecretValue(gatewayId, `${secretPrefix}.password`);
    const username = authCfg.username || "";
    if (!username || !password) throw new Error(`Missing basic auth credentials for integration "${integration.name}"`);
    headers.Authorization = `Basic ${basicAuthValue(username, password)}`;
  }

  let requestBody: any = endpoint.bodyTemplate;
  if (args.body !== undefined) {
    requestBody = args.body;
  }
  const bodyInfo = stringifyBody(requestBody);
  if (bodyInfo.contentType && !headers["content-type"] && !headers["Content-Type"]) {
    headers["content-type"] = bodyInfo.contentType;
  }

  const timeoutMs = Math.max(1000, Math.min(60000, Number(endpoint.timeoutMs || 15000)));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url.toString(), {
      method,
      headers,
      body: bodyInfo.payload,
      signal: controller.signal,
    });

    const contentType = res.headers.get("content-type") || "";
    const statusLine = `Status: ${res.status} ${res.statusText}`;

    let text: string;
    if (contentType.includes("json")) {
      const json = await res.json().catch(() => null);
      text = json === null ? "" : JSON.stringify(json, null, 2);
    } else {
      text = await res.text();
    }
    if (text.length > 20000) text = `${text.slice(0, 20000)}\n... [truncated]`;

    return `${statusLine}\nContent-Type: ${contentType || "unknown"}\n\n${text || "(empty response body)"}`;
  } catch (err: any) {
    if (err?.name === "AbortError") {
      throw new Error(`Request timed out after ${timeoutMs}ms`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export async function checkIntegrationHealth(params: {
  gatewayId: Id<"gateways">;
  integration: any;
}): Promise<{ status: "healthy" | "degraded" | "down"; statusCode?: number; error?: string }> {
  const endpoint = {
    method: "GET",
    path: params.integration.healthPath || "/",
    headers: {},
    queryTemplate: {},
    bodyTemplate: undefined,
    timeoutMs: 12000,
    enabled: true,
    name: "__health__",
  };

  try {
    const result = await executeIntegrationEndpoint({
      gatewayId: params.gatewayId,
      integration: params.integration,
      endpoint,
      args: {},
    });
    const line = result.split("\n")[0] || "";
    const codeMatch = line.match(/\b(\d{3})\b/);
    const statusCode = codeMatch ? Number(codeMatch[1]) : undefined;
    if (!statusCode) return { status: "healthy" };
    if (statusCode >= 200 && statusCode < 400) return { status: "healthy", statusCode };
    if (statusCode >= 400 && statusCode < 500) return { status: "degraded", statusCode };
    return { status: "down", statusCode };
  } catch (err: any) {
    return { status: "down", error: err?.message || "Health check failed" };
  }
}

export async function syncIntegrationTools(gatewayId: Id<"gateways">, integrationId?: Id<"apiIntegrations">) {
  const rows = await convexClient.query(api.functions.integrations.list, { gatewayId });
  const tools = await convexClient.query(api.functions.tools.list, { gatewayId });
  const toolByName = new Map(tools.map((row: any) => [row.name, row]));

  const targetIntegrations = integrationId
    ? rows.filter((row: any) => String(row._id) === String(integrationId))
    : rows;

  const desired = new Map<string, {
    description: string;
    enabled: boolean;
    requiresApproval: boolean;
    parameters: any;
    handlerCode: string;
  }>();

  for (const integration of targetIntegrations) {
    for (const endpoint of integration.endpoints || []) {
      if (!endpoint.exposeAsTool) continue;
      const toolName = String(endpoint.toolName || buildToolName(integration.slug, endpoint.slug));
      desired.set(toolName, {
        description: endpoint.description
          ? `${endpoint.description} [${integration.name}]`
          : `${endpoint.method.toUpperCase()} ${endpoint.path} via ${integration.name}`,
        enabled: Boolean(integration.enabled && endpoint.enabled),
        requiresApproval: Boolean(endpoint.requiresApproval),
        parameters: endpoint.argsSchema || defaultEndpointArgsSchema(),
        handlerCode: buildIntegrationToolHandlerCode(integration.slug, endpoint.slug),
      });
    }
  }

  const prefixSet = new Set<string>();
  for (const integration of targetIntegrations) prefixSet.add(`${integration.slug}.`);

  for (const [name, def] of desired.entries()) {
    await convexClient.mutation(api.functions.tools.create, {
      gatewayId,
      name,
      description: def.description,
      category: "integration",
      enabled: def.enabled,
      requiresApproval: def.requiresApproval,
      parameters: def.parameters,
      handlerCode: def.handlerCode,
    });
  }

  for (const tool of tools as any[]) {
    if (tool.category !== "integration") continue;
    if (![...prefixSet].some((prefix) => String(tool.name || "").startsWith(prefix))) continue;
    if (desired.has(tool.name)) continue;
    await convexClient.mutation(api.functions.tools.remove, { id: tool._id });
  }

  // Refresh enabled + requiresApproval + description for desired tools in case create no-op on existing.
  for (const [name, def] of desired.entries()) {
    const existing = toolByName.get(name);
    if (!existing) continue;
    await convexClient.mutation(api.functions.tools.update, {
      id: existing._id,
      enabled: def.enabled,
      requiresApproval: def.requiresApproval,
      description: def.description,
      category: "integration",
      parameters: def.parameters,
      handlerCode: def.handlerCode,
    } as any);
  }
}
