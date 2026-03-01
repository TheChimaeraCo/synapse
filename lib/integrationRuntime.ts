import { convexClient } from "@/lib/convex";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { resolveAiSelection } from "@/lib/aiRouting";
import { defaultModelForProvider } from "@/lib/aiRoutingConfig";
import { resolveModelCompat } from "@/lib/modelCompat";

type IntegrationAuthType = "none" | "bearer" | "header" | "query" | "basic";

export interface DiscoveredEndpoint {
  name: string;
  method: string;
  path: string;
  description?: string;
  source?: string;
}

export interface IntegrationDiscoveryAutofill {
  name?: string;
  baseUrl?: string;
  healthPath?: string;
  authHint?: IntegrationAuthType;
  authConfig?: {
    headerName?: string;
    queryName?: string;
    username?: string;
  };
  confidence?: number;
  summary?: string;
}

export interface IntegrationDiscoveryResult {
  endpoints: DiscoveredEndpoint[];
  autofill?: IntegrationDiscoveryAutofill;
  notes: string[];
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

function clip(text: string, max = 12000): string {
  const t = String(text || "");
  if (t.length <= max) return t;
  return `${t.slice(0, max)}\n... [truncated]`;
}

function stripHtml(html: string): string {
  return String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeAuthHint(value: any): IntegrationAuthType | undefined {
  if (value === "none" || value === "bearer" || value === "header" || value === "query" || value === "basic") {
    return value;
  }
  return undefined;
}

function extractLikelyDocLinks(html: string, baseUrl: string): string[] {
  const out = new Set<string>();
  const re = /href\s*=\s*["']([^"']+)["']/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html)) !== null) {
    const raw = String(match[1] || "").trim();
    if (!raw || raw.startsWith("#")) continue;
    if (!/(openapi|swagger|api-docs|reference|docs|redoc|postman|\.json|\.ya?ml)/i.test(raw)) continue;
    try {
      const next = new URL(raw, baseUrl);
      if (!["http:", "https:"].includes(next.protocol)) continue;
      out.add(next.toString());
      if (out.size >= 8) break;
    } catch {
      continue;
    }
  }
  return [...out];
}

function parseOpenApiAutofill(doc: any): IntegrationDiscoveryAutofill {
  const out: IntegrationDiscoveryAutofill = {};
  if (!doc || typeof doc !== "object") return out;

  const title = String(doc.info?.title || "").trim();
  if (title) out.name = title;

  const serverUrl = String(doc.servers?.[0]?.url || "").trim();
  if (serverUrl) {
    try {
      const parsed = new URL(serverUrl);
      out.baseUrl = `${parsed.origin}${parsed.pathname.replace(/\/+$/, "")}`;
    } catch {}
  }

  const lower = JSON.stringify(doc).toLowerCase();
  if (/\bbearer\b|\btoken\b/.test(lower)) {
    out.authHint = "bearer";
  }
  if (/\bapi[\s_-]?key\b/.test(lower)) {
    if (/\bin:\s*header\b/.test(lower)) out.authHint = "header";
    if (/\bin:\s*query\b/.test(lower)) out.authHint = "query";
  }

  const paths = doc.paths && typeof doc.paths === "object" ? Object.keys(doc.paths) : [];
  const healthPath = paths.find((p) => /^\/(health|healthz|status|ping|ready|live)(\/|$)/i.test(String(p)));
  if (healthPath) out.healthPath = normalizePath(healthPath);
  return out;
}

function inferAutofillFromText(text: string): IntegrationDiscoveryAutofill {
  const lower = String(text || "").toLowerCase();
  const out: IntegrationDiscoveryAutofill = {};

  if (/\bbearer\b|\bauthorization:\s*bearer\b|\boauth2?\b|\baccess token\b/.test(lower)) {
    out.authHint = "bearer";
  } else if (/\bbasic auth\b|\bauthorization:\s*basic\b/.test(lower)) {
    out.authHint = "basic";
  } else if (/\bapi[\s_-]?key\b/.test(lower) && /\bquery\b/.test(lower)) {
    out.authHint = "query";
  } else if (/\bapi[\s_-]?key\b/.test(lower)) {
    out.authHint = "header";
  }

  const headerMatch = text.match(/\b(X-[A-Za-z0-9-]*API[-_]?KEY|X-API-KEY|API-KEY)\b/i);
  const queryMatch = text.match(/\b(api[_-]?key|access[_-]?token|token)\b/i);
  if (headerMatch) out.authConfig = { ...(out.authConfig || {}), headerName: headerMatch[1] };
  if (queryMatch) out.authConfig = { ...(out.authConfig || {}), queryName: queryMatch[1] };

  const healthMatch = text.match(/\/(healthz?|status|ping|ready|live)(?:\/[A-Za-z0-9._~-]+)?/i);
  if (healthMatch) out.healthPath = normalizePath(healthMatch[0]);

  return out;
}

function mergeAutofill(
  base: IntegrationDiscoveryAutofill | undefined,
  incoming: IntegrationDiscoveryAutofill | undefined,
): IntegrationDiscoveryAutofill | undefined {
  if (!base && !incoming) return undefined;
  const out: IntegrationDiscoveryAutofill = { ...(base || {}) };
  if (!incoming) return out;

  if (incoming.name) out.name = incoming.name;
  if (incoming.baseUrl) out.baseUrl = incoming.baseUrl;
  if (incoming.healthPath) out.healthPath = incoming.healthPath;
  if (incoming.authHint) out.authHint = incoming.authHint;
  if (incoming.summary) out.summary = incoming.summary;
  if (incoming.confidence !== undefined) out.confidence = incoming.confidence;
  if (incoming.authConfig) {
    out.authConfig = {
      ...(out.authConfig || {}),
      ...(incoming.authConfig || {}),
    };
  }
  return out;
}

function safeParseJsonBlock(text: string): any {
  const raw = String(text || "").trim();
  if (!raw) return null;

  try {
    return JSON.parse(raw);
  } catch {}

  const fenced = raw.match(/```json\s*([\s\S]*?)\s*```/i) || raw.match(/```\s*([\s\S]*?)\s*```/i);
  if (fenced?.[1]) {
    try {
      return JSON.parse(fenced[1]);
    } catch {}
  }

  const first = raw.indexOf("{");
  const last = raw.lastIndexOf("}");
  if (first >= 0 && last > first) {
    try {
      return JSON.parse(raw.slice(first, last + 1));
    } catch {}
  }

  return null;
}

function sanitizeAiAutofill(input: any): IntegrationDiscoveryAutofill | undefined {
  if (!input || typeof input !== "object") return undefined;
  const name = String(input.name || "").trim();
  const baseUrl = String(input.baseUrl || "").trim();
  const healthPath = String(input.healthPath || "").trim();
  const authHint = normalizeAuthHint(String(input.authType || input.authHint || "").trim().toLowerCase());
  const headerName = String(input.headerName || input.authConfig?.headerName || "").trim();
  const queryName = String(input.queryName || input.authConfig?.queryName || "").trim();
  const username = String(input.username || input.authConfig?.username || "").trim();
  const summary = String(input.summary || input.notes || "").trim();

  const confidenceRaw = Number(input.confidence);
  const confidence = Number.isFinite(confidenceRaw)
    ? Math.max(0, Math.min(100, Math.round(confidenceRaw)))
    : undefined;

  const authConfig: Record<string, string> = {};
  if (headerName) authConfig.headerName = headerName;
  if (queryName) authConfig.queryName = queryName;
  if (username) authConfig.username = username;

  const out: IntegrationDiscoveryAutofill = {};
  if (name) out.name = name;
  if (baseUrl) out.baseUrl = baseUrl;
  if (healthPath) out.healthPath = normalizePath(healthPath);
  if (authHint) out.authHint = authHint;
  if (Object.keys(authConfig).length > 0) out.authConfig = authConfig;
  if (summary) out.summary = summary;
  if (confidence !== undefined) out.confidence = confidence;
  return Object.keys(out).length > 0 ? out : undefined;
}

function sanitizeAiEndpoints(input: any, source = "ai_docs_agent"): DiscoveredEndpoint[] {
  if (!Array.isArray(input)) return [];
  const out: DiscoveredEndpoint[] = [];
  for (const row of input) {
    if (!row || typeof row !== "object") continue;
    const method = normalizeMethod(String((row as any).method || "GET"));
    let path = String((row as any).path || "").trim();
    if (!path) continue;
    try {
      if (path.startsWith("http://") || path.startsWith("https://")) {
        path = new URL(path).pathname || "/";
      }
    } catch {}
    const normalizedPath = normalizePath(path);
    out.push({
      name: String((row as any).name || endpointNameFromPath(method, normalizedPath)).trim(),
      method,
      path: normalizedPath,
      description: String((row as any).description || "").trim() || undefined,
      source,
    });
  }
  return out;
}

async function runIntegrationDiscoverySubagent(opts: {
  gatewayId?: Id<"gateways"> | string;
  baseUrl?: string;
  docsUrl?: string;
  sourceText: string;
  extractedEndpoints: DiscoveredEndpoint[];
}): Promise<{ autofill?: IntegrationDiscoveryAutofill; endpoints: DiscoveredEndpoint[]; note?: string }> {
  if (!opts.gatewayId) {
    return { endpoints: [] };
  }

  try {
    const selection = await resolveAiSelection({
      gatewayId: opts.gatewayId as Id<"gateways">,
      capability: "analysis",
      message: "API integration endpoint discovery and config extraction from docs",
    });
    if (!selection.apiKey) {
      return { endpoints: [], note: "AI analysis skipped: no AI API key configured." };
    }

    const { registerBuiltInApiProviders, getModel, complete } = await import("@mariozechner/pi-ai");
    registerBuiltInApiProviders();

    const modelResolution = resolveModelCompat({
      provider: selection.provider,
      requestedModelId: selection.model,
      fallbackModelId: defaultModelForProvider(selection.provider),
      getModel,
    });
    const model = modelResolution.model;
    if (!model) {
      return { endpoints: [], note: `AI analysis skipped: model "${selection.model}" unavailable.` };
    }

    const endpointPreview = opts.extractedEndpoints.slice(0, 120).map((ep) => ({
      name: ep.name,
      method: ep.method,
      path: ep.path,
      description: ep.description,
    }));

    const prompt = [
      "Analyze API docs and return JSON only.",
      "Infer integration setup fields and key endpoints.",
      "Do not include markdown or commentary.",
      "",
      "Return schema:",
      "{",
      '  "name": "string or empty",',
      '  "baseUrl": "string or empty",',
      '  "healthPath": "string or empty",',
      '  "authType": "none|bearer|header|query|basic|empty",',
      '  "headerName": "string or empty",',
      '  "queryName": "string or empty",',
      '  "username": "string or empty",',
      '  "confidence": 0-100,',
      '  "summary": "one short sentence",',
      '  "endpoints": [{"name":"...","method":"GET","path":"/...","description":"..."}]',
      "}",
      "",
      `Base URL hint: ${opts.baseUrl || ""}`,
      `Docs URL hint: ${opts.docsUrl || ""}`,
      "",
      "Already extracted endpoints:",
      JSON.stringify(endpointPreview, null, 2),
      "",
      "Docs text:",
      clip(opts.sourceText, 30000),
      "",
      "If unsure, leave fields empty.",
    ].join("\n");

    const context: any = {
      systemPrompt:
        "You are an API integration discovery subagent. Return strictly valid JSON with no code fences.",
      messages: [
        {
          role: "user" as const,
          content: prompt,
          timestamp: Date.now(),
        },
      ],
    };

    const result = await complete(model, context, {
      apiKey: selection.apiKey,
      maxTokens: 1400,
    });

    let text = "";
    for (const block of result.content || []) {
      if (block?.type === "text") text += block.text;
    }

    const parsed = safeParseJsonBlock(text);
    if (!parsed || typeof parsed !== "object") {
      return { endpoints: [], note: "AI analysis returned unparsable JSON." };
    }

    const autofill = sanitizeAiAutofill(parsed);
    const endpoints = sanitizeAiEndpoints(parsed.endpoints);
    return { autofill, endpoints };
  } catch (err: any) {
    return { endpoints: [], note: `AI analysis skipped: ${err?.message || "unknown error"}` };
  }
}

async function discoverIntegrationDetailsInternal(opts: {
  baseUrl?: string;
  docsUrl?: string;
  docsText?: string;
  gatewayId?: Id<"gateways"> | string;
  aiAssist?: boolean;
  allowPrivateNetwork?: boolean;
  maxEndpoints?: number;
}): Promise<IntegrationDiscoveryResult> {
  const max = Math.max(1, Math.min(100, Number(opts.maxEndpoints || 40)));
  const urls: Array<{ url: string; source: string }> = [];
  const docsUrl = String(opts.docsUrl || "").trim();
  const baseUrl = String(opts.baseUrl || "").trim().replace(/\/+$/, "");
  const docsText = String(opts.docsText || "").trim();

  if (docsUrl) urls.push({ url: docsUrl, source: "docs_url" });
  if (baseUrl) {
    urls.push({ url: `${baseUrl}/openapi.json`, source: "openapi.json" });
    urls.push({ url: `${baseUrl}/swagger.json`, source: "swagger.json" });
    urls.push({ url: `${baseUrl}/v3/api-docs`, source: "v3/api-docs" });
    urls.push({ url: `${baseUrl}/docs`, source: "docs" });
    urls.push({ url: `${baseUrl}/api/docs`, source: "api_docs" });
  }

  const discovered: DiscoveredEndpoint[] = [];
  let heuristicAutofill: IntegrationDiscoveryAutofill | undefined = undefined;
  const notes: string[] = [];
  const sourceTextChunks: string[] = [];

  const seenUrl = new Set<string>();

  const queue = [...urls];
  while (queue.length > 0 && seenUrl.size < 14) {
    const candidate = queue.shift();
    if (!candidate) break;
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

      if (contentType.includes("html")) {
        const html = await res.text();
        const stripped = stripHtml(html);
        sourceTextChunks.push(`[${candidate.source}] ${clip(stripped, 4000)}`);
        discovered.push(...extractRegexEndpoints(stripped, candidate.source));
        heuristicAutofill = mergeAutofill(heuristicAutofill, inferAutofillFromText(stripped));
        const links = extractLikelyDocLinks(html, parsed.toString());
        for (const link of links) {
          if (!seenUrl.has(link)) queue.push({ url: link, source: `linked:${candidate.source}` });
        }
        continue;
      }

      if (contentType.includes("json")) {
        const json = await res.json().catch(() => null);
        if (json) {
          discovered.push(...extractOpenApiEndpoints(json, candidate.source));
          heuristicAutofill = mergeAutofill(heuristicAutofill, parseOpenApiAutofill(json));
          sourceTextChunks.push(`[${candidate.source}] ${clip(JSON.stringify(json), 6000)}`);
        }
        continue;
      }
      const text = await res.text();
      if (text) {
        sourceTextChunks.push(`[${candidate.source}] ${clip(stripHtml(text), 5000)}`);
        heuristicAutofill = mergeAutofill(heuristicAutofill, inferAutofillFromText(text));
        // Try JSON parse even if content type is incorrect.
        try {
          const json = JSON.parse(text);
          discovered.push(...extractOpenApiEndpoints(json, candidate.source));
          heuristicAutofill = mergeAutofill(heuristicAutofill, parseOpenApiAutofill(json));
        } catch {
          discovered.push(...extractRegexEndpoints(text, candidate.source));
        }
      }
    } catch {
      continue;
    }
  }

  if (docsText) {
    sourceTextChunks.push(`[docs_text] ${clip(docsText, 12000)}`);
    discovered.push(...extractRegexEndpoints(docsText, "docs_text"));
    heuristicAutofill = mergeAutofill(heuristicAutofill, inferAutofillFromText(docsText));
  }

  if (baseUrl) {
    heuristicAutofill = mergeAutofill(heuristicAutofill, { baseUrl });
  }

  const sourceText = sourceTextChunks.join("\n\n");
  let aiAutofill: IntegrationDiscoveryAutofill | undefined = undefined;
  let aiEndpoints: DiscoveredEndpoint[] = [];

  if (opts.aiAssist !== false && sourceText.trim()) {
    const ai = await runIntegrationDiscoverySubagent({
      gatewayId: opts.gatewayId,
      baseUrl,
      docsUrl,
      sourceText,
      extractedEndpoints: discovered,
    });
    aiAutofill = ai.autofill;
    aiEndpoints = ai.endpoints;
    if (ai.note) notes.push(ai.note);
  }

  const endpoints = uniqByMethodPath([...discovered, ...aiEndpoints]).slice(0, max);
  const autofill = mergeAutofill(heuristicAutofill, aiAutofill);

  if (!endpoints.length) {
    notes.push("No endpoints were discovered. Add endpoint rows manually or provide richer docs.");
  }

  return { endpoints, autofill, notes };
}

export async function discoverIntegrationDetails(opts: {
  baseUrl?: string;
  docsUrl?: string;
  docsText?: string;
  gatewayId?: Id<"gateways"> | string;
  aiAssist?: boolean;
  allowPrivateNetwork?: boolean;
  maxEndpoints?: number;
}): Promise<IntegrationDiscoveryResult> {
  return discoverIntegrationDetailsInternal(opts);
}

export async function discoverIntegrationEndpoints(opts: {
  baseUrl?: string;
  docsUrl?: string;
  docsText?: string;
  gatewayId?: Id<"gateways"> | string;
  aiAssist?: boolean;
  allowPrivateNetwork?: boolean;
  maxEndpoints?: number;
}): Promise<DiscoveredEndpoint[]> {
  const result = await discoverIntegrationDetailsInternal(opts);
  return result.endpoints;
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
