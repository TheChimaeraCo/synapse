// Synapse - (c) The Chimaera Company LLC
// Licensed under the Functional Source License 1.0
import { TOOL_REGISTRY, type ToolContext } from "./builtinTools";
import type { ToolCall, Tool } from "@mariozechner/pi-ai";
import { Type } from "@sinclair/typebox";
import * as vm from "vm";
import { createHash } from "crypto";

// Tool cache TTLs in milliseconds
const TOOL_CACHE_TTLS: Record<string, number> = {
  web_search: 60 * 60 * 1000,      // 1 hour
  code_execute: 5 * 60 * 1000,      // 5 minutes
};

const DANGEROUS_TOOLS = new Set([
  "shell_exec",
  "convex_deploy",
  "create_tool",
  "spawn_agent",
  "pm2_start",
  "pm2_stop",
  "pm2_restart",
  "pm2_delete",
]);
const NETWORK_TOOLS = new Set(["web_search", "http_request"]);
const SECRET_SINK_TOOLS = new Set([
  "shell_exec",
  "convex_deploy",
  "create_tool",
  "http_request",
  "file_write",
]);
const SENSITIVE_KEY_NAME_RE =
  /(^|[_\-.])(api[_-]?key|access[_-]?token|refresh[_-]?token|token|secret|password|private[_-]?key|authorization|bearer|cookie|session)([_\-.]|$)/i;
const SENSITIVE_VALUE_RE = /(sk-[a-z0-9][a-z0-9._-]{16,}|ghp_[a-z0-9]{20,}|xox[baprs]-[a-z0-9-]{10,}|AIza[0-9A-Za-z\-_]{20,}|eyJ[A-Za-z0-9\-_]{10,}\.[A-Za-z0-9\-_]{10,}\.[A-Za-z0-9\-_]{10,})/i;

type ToolPolicyMode = "allowlist" | "blocklist" | "all";
type ExecApprovalMode = "none" | "destructive" | "all";

interface SandboxPolicy {
  mode: "off" | "all" | "untrusted";
  toolPolicy: ToolPolicyMode;
  execApproval: ExecApprovalMode;
  network: "enabled" | "disabled";
  allowedList: string[];
  blockedList: string[];
}

function getToolCacheKey(toolName: string, args: Record<string, any>): string | null {
  if (!TOOL_CACHE_TTLS[toolName]) return null;
  const inputHash = createHash("sha256").update(JSON.stringify(args)).digest("hex").slice(0, 16);
  return `${toolName}:${inputHash}`;
}

async function getCachedResult(cacheKey: string): Promise<string | null> {
  try {
    const { convexClient } = await import("@/lib/convex");
    const { api } = await import("@/convex/_generated/api");
    const cached = await convexClient.query(api.functions.toolCache.get, { cacheKey });
    return cached?.result || null;
  } catch {
    return null;
  }
}

async function setCachedResult(toolName: string, cacheKey: string, result: string): Promise<void> {
  try {
    const { convexClient } = await import("@/lib/convex");
    const { api } = await import("@/convex/_generated/api");
    const inputHash = cacheKey.split(":")[1] || cacheKey;
    await convexClient.mutation(api.functions.toolCache.set, {
      cacheKey,
      toolName,
      inputHash,
      result,
      ttlMs: TOOL_CACHE_TTLS[toolName] || 3600000,
    });
  } catch {}
}

export interface ToolResult {
  toolCallId: string;
  toolName: string;
  content: string;
  isError: boolean;
}

interface ApprovalRow {
  _id: string;
  toolName: string;
  toolArgs: Record<string, any>;
  status: "pending" | "approved" | "denied";
}

interface SessionApprovalState {
  pending: ApprovalRow[];
  approved: ApprovalRow[];
  denied: ApprovalRow[];
}

function parseList(value?: string | null): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((v) => v.trim().toLowerCase())
    .filter(Boolean);
}

function normalizeToolPolicy(value?: string | null): ToolPolicyMode {
  if (value === "blocklist") return "blocklist";
  if (value === "all") return "all";
  return "allowlist";
}

function normalizeExecApproval(value?: string | null): ExecApprovalMode {
  if (value === "all") return "all";
  if (value === "destructive") return "destructive";
  return "none";
}

function normalizeSandboxMode(value?: string | null): SandboxPolicy["mode"] {
  if (value === "all" || value === "untrusted") return value;
  return "off";
}

async function loadSandboxPolicy(gatewayId: string): Promise<SandboxPolicy> {
  const defaults: SandboxPolicy = {
    mode: "off",
    toolPolicy: "allowlist",
    execApproval: "none",
    network: "enabled",
    allowedList: [],
    blockedList: [],
  };
  const keys = [
    "sandbox.mode",
    "sandbox.tool_policy",
    "sandbox.exec_approval",
    "sandbox.network",
    "sandbox.allowed_commands",
    "sandbox.blocked_commands",
  ];

  try {
    const { convexClient } = await import("@/lib/convex");
    const { api } = await import("@/convex/_generated/api");
    let config: Record<string, string> = {};
    try {
      config = await convexClient.query(api.functions.gatewayConfig.getMultiple, {
        gatewayId: gatewayId as any,
        keys,
      });
    } catch {
      config = await convexClient.query(api.functions.config.getMultiple, { keys });
    }

    return {
      mode: normalizeSandboxMode(config["sandbox.mode"]),
      toolPolicy: normalizeToolPolicy(config["sandbox.tool_policy"]),
      execApproval: normalizeExecApproval(config["sandbox.exec_approval"]),
      network: config["sandbox.network"] === "disabled" ? "disabled" : "enabled",
      allowedList: parseList(config["sandbox.allowed_commands"]),
      blockedList: parseList(config["sandbox.blocked_commands"]),
    };
  } catch {
    return defaults;
  }
}

function matchesConfiguredItem(value: string, list: string[]): boolean {
  const normalized = value.toLowerCase();
  return list.some((entry) => normalized === entry || normalized.includes(entry));
}

function isToolBlockedByPolicy(
  toolName: string,
  args: Record<string, any>,
  policy: SandboxPolicy,
): string | null {
  if (policy.mode === "off") return null;

  if (policy.network === "disabled" && NETWORK_TOOLS.has(toolName)) {
    return "network access is disabled by sandbox policy";
  }

  if (policy.toolPolicy === "allowlist" && policy.allowedList.length > 0 && !matchesConfiguredItem(toolName, policy.allowedList)) {
    return "tool is not in the sandbox allowlist";
  }

  if (policy.toolPolicy === "blocklist" && policy.blockedList.length > 0 && matchesConfiguredItem(toolName, policy.blockedList)) {
    return "tool is blocked by sandbox policy";
  }

  if (policy.blockedList.length > 0) {
    const commandLike = [args?.command, args?.script, args?.name]
      .filter((v) => typeof v === "string")
      .join(" ")
      .toLowerCase();
    if (commandLike && matchesConfiguredItem(commandLike, policy.blockedList)) {
      return "command payload matches a blocked sandbox rule";
    }
  }

  return null;
}

function canBypassApproval(context: ToolContext): boolean {
  // Security default: require explicit approvals for dangerous tools, even for owner/admin.
  // To opt into legacy behavior in trusted local setups, set SYNAPSE_AUTO_APPROVE_TOOLS=true.
  return process.env.SYNAPSE_AUTO_APPROVE_TOOLS === "true";
}

function hasLikelySecretEntropy(value: string): boolean {
  const v = value.trim();
  if (v.length < 24 || v.length > 4096) return false;
  if (/\s/.test(v)) return false;
  const upper = /[A-Z]/.test(v);
  const lower = /[a-z]/.test(v);
  const digit = /[0-9]/.test(v);
  const symbol = /[_\-=.:/+]/.test(v);
  if (!lower || !digit) return false;
  const classes = [upper, lower, digit, symbol].filter(Boolean).length;
  return classes >= 3;
}

function hasSensitivePayload(value: any, path = "", depth = 0): boolean {
  if (depth > 6 || value === null || value === undefined) return false;
  if (typeof value === "string") {
    if (SENSITIVE_VALUE_RE.test(value)) return true;
    return hasLikelySecretEntropy(value);
  }
  if (typeof value === "number" || typeof value === "boolean") return false;
  if (Array.isArray(value)) {
    return value.some((item, i) => hasSensitivePayload(item, `${path}[${i}]`, depth + 1));
  }
  if (typeof value === "object") {
    for (const [key, v] of Object.entries(value)) {
      const nextPath = path ? `${path}.${key}` : key;
      if (SENSITIVE_KEY_NAME_RE.test(key)) {
        if (typeof v === "string" && v.trim()) return true;
        if (v && typeof v === "object") return true;
      }
      if (typeof v === "string" && SENSITIVE_KEY_NAME_RE.test(nextPath) && v.trim()) return true;
      if (hasSensitivePayload(v, nextPath, depth + 1)) return true;
    }
  }
  return false;
}

async function createApprovalRequest(
  context: ToolContext,
  toolName: string,
  toolArgs: Record<string, any>,
): Promise<string | null> {
  try {
    const { convexClient } = await import("@/lib/convex");
    const { api } = await import("@/convex/_generated/api");
    const id = await convexClient.mutation(api.functions.approvals.create, {
      gatewayId: context.gatewayId as any,
      sessionId: context.sessionId as any,
      toolName,
      toolArgs,
    });
    return String(id);
  } catch {
    return null;
  }
}

function stableStringify(value: any): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }
  const entries = Object.entries(value).sort(([a], [b]) => a.localeCompare(b));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(",")}}`;
}

function isSameToolRequest(aName: string, aArgs: Record<string, any>, row: ApprovalRow): boolean {
  if (aName !== row.toolName) return false;
  return stableStringify(aArgs || {}) === stableStringify(row.toolArgs || {});
}

async function getSessionApprovalState(context: ToolContext): Promise<SessionApprovalState | null> {
  if (!context.sessionId) return null;
  try {
    const { convexClient } = await import("@/lib/convex");
    const { api } = await import("@/convex/_generated/api");
    const sessionId = context.sessionId as any;

    const [pending, approved, denied] = await Promise.all([
      convexClient.query(api.functions.approvals.getBySessionStatus, { sessionId, status: "pending" }),
      convexClient.query(api.functions.approvals.getBySessionStatus, { sessionId, status: "approved" }),
      convexClient.query(api.functions.approvals.getBySessionStatus, { sessionId, status: "denied" }),
    ]);

    return {
      pending: pending as any[],
      approved: approved as any[],
      denied: denied as any[],
    };
  } catch {
    return null;
  }
}

/**
 * Execute dynamic tool handler code in a sandboxed vm context.
 */
export async function executeDynamicTool(
  handlerCode: string,
  args: Record<string, any>,
  context: ToolContext
): Promise<string> {
  const output: string[] = [];
  const sandbox = {
    args,
    context,
    fetch: globalThis.fetch,
    JSON,
    Math,
    Date,
    Array,
    Object,
    Map,
    Set,
    Promise,
    RegExp,
    Error,
    parseInt,
    parseFloat,
    isNaN,
    isFinite,
    encodeURIComponent,
    decodeURIComponent,
    URL,
    URLSearchParams,
    TextEncoder,
    TextDecoder,
    console: {
      log: (...a: any[]) => output.push(a.map(String).join(" ")),
      error: (...a: any[]) => output.push("[ERROR] " + a.map(String).join(" ")),
    },
    result: "" as any,
  };

  const wrappedCode = `
    (async () => {
      const handler = async (args, context) => { ${handlerCode} };
      result = await handler(args, context);
    })().catch(e => { result = "Error: " + e.message; });
  `;

  const ctx = vm.createContext(sandbox);
  const script = new vm.Script(wrappedCode);
  script.runInContext(ctx, { timeout: 10000 });

  // Wait for async completion
  await new Promise(resolve => setTimeout(resolve, 100));
  if (!sandbox.result && output.length === 0) {
    await new Promise(resolve => setTimeout(resolve, 5000));
  }

  return String(sandbox.result) || output.join("\n") || "No output";
}

/**
 * Execute an array of tool calls and return results.
 */
export async function executeTools(
  toolCalls: ToolCall[],
  context: ToolContext,
  dbTools?: Array<{
    name: string;
    handlerCode?: string;
    requiresApproval?: boolean;
    providerProfileId?: string;
    provider?: string;
    model?: string;
  }>,
): Promise<ToolResult[]> {
  const results: ToolResult[] = [];
  const approvalState = await getSessionApprovalState(context);
  const sandboxPolicy = await loadSandboxPolicy(context.gatewayId);

  // Build a map of DB tools by name
  const dbToolMap = new Map<string, {
    handlerCode?: string;
    requiresApproval?: boolean;
    providerProfileId?: string;
    provider?: string;
    model?: string;
  }>();
  if (dbTools) {
    for (const t of dbTools) {
      dbToolMap.set(t.name, {
        handlerCode: t.handlerCode,
        requiresApproval: t.requiresApproval,
        providerProfileId: t.providerProfileId,
        provider: t.provider,
        model: t.model,
      });
    }
  }

  for (const call of toolCalls) {
    const previousToolOverride = (context as any).__toolModelOverride;
    const dbTool = dbToolMap.get(call.name);
    const override = {
      toolName: call.name,
      providerProfileId: dbTool?.providerProfileId,
      provider: dbTool?.provider,
      model: dbTool?.model,
    };
    if (override.providerProfileId || override.provider || override.model) {
      (context as any).__toolModelOverride = override;
    } else {
      delete (context as any).__toolModelOverride;
    }

    try {
      const handler = TOOL_REGISTRY.get(call.name);
      if (SECRET_SINK_TOOLS.has(call.name) && hasSensitivePayload(call.arguments)) {
        results.push({
          toolCallId: call.id,
          toolName: call.name,
          content: `Tool "${call.name}" blocked: sensitive credential-like values detected in arguments. Save secrets in Settings instead of sending them through tool calls.`,
          isError: true,
        });
        continue;
      }
      const blockedReason = isToolBlockedByPolicy(call.name, call.arguments, sandboxPolicy);
      if (blockedReason) {
        results.push({
          toolCallId: call.id,
          toolName: call.name,
          content: `Tool "${call.name}" blocked: ${blockedReason}.`,
          isError: true,
        });
        continue;
      }

      const defaultApproval = Boolean(handler?.requiresApproval || dbTool?.requiresApproval);
      const requiresApproval = sandboxPolicy.execApproval === "all"
        ? true
        : sandboxPolicy.execApproval === "destructive"
          ? defaultApproval || DANGEROUS_TOOLS.has(call.name)
          : defaultApproval;

      if (requiresApproval && !canBypassApproval(context)) {
        const denied = approvalState?.denied.find((row) =>
          isSameToolRequest(call.name, call.arguments, row)
        );
        if (denied) {
          results.push({
            toolCallId: call.id,
            toolName: call.name,
            content: `Tool "${call.name}" was denied by owner/admin.`,
            isError: true,
          });
          continue;
        }

        const approved = approvalState?.approved.find((row) =>
          isSameToolRequest(call.name, call.arguments, row)
        );
        if (!approved) {
          const existingPending = approvalState?.pending.find((row) =>
            isSameToolRequest(call.name, call.arguments, row)
          );

          if (existingPending) {
            results.push({
              toolCallId: call.id,
              toolName: call.name,
              content: `Tool "${call.name}" is waiting for owner/admin approval. Request: ${existingPending._id}.`,
              isError: true,
            });
            continue;
          }

          const approvalId = await createApprovalRequest(context, call.name, call.arguments);
          if (approvalId && approvalState) {
            approvalState.pending.push({
              _id: approvalId,
              toolName: call.name,
              toolArgs: call.arguments,
              status: "pending",
            });
          }
          results.push({
            toolCallId: call.id,
            toolName: call.name,
            content: approvalId
              ? `Tool "${call.name}" requires owner/admin approval. Approval request created: ${approvalId}.`
              : `Tool "${call.name}" requires owner/admin approval.`,
            isError: true,
          });
          continue;
        }
      }

      // Check tool cache first
      const cacheKey = getToolCacheKey(call.name, call.arguments);
      if (cacheKey) {
        const cached = await getCachedResult(cacheKey);
        if (cached) {
          results.push({ toolCallId: call.id, toolName: call.name, content: `(cached) ${cached}`, isError: false });
          continue;
        }
      }

      // 1. Check builtin registry first
      if (handler) {
        try {
          const output = await handler.handler(call.arguments, context);
          results.push({ toolCallId: call.id, toolName: call.name, content: output, isError: false });
          // Cache if applicable
          if (cacheKey) setCachedResult(call.name, cacheKey, output);
        } catch (err: any) {
          results.push({ toolCallId: call.id, toolName: call.name, content: `Tool error: ${err.message}`, isError: true });
        }
        continue;
      }

      // 2. Check DB tools with handlerCode
      const handlerCode = dbTool?.handlerCode;
      if (handlerCode) {
        try {
          const output = await executeDynamicTool(handlerCode, call.arguments, context);
          results.push({ toolCallId: call.id, toolName: call.name, content: output, isError: false });
        } catch (err: any) {
          results.push({ toolCallId: call.id, toolName: call.name, content: `Dynamic tool error: ${err.message}`, isError: true });
        }
        continue;
      }

      results.push({ toolCallId: call.id, toolName: call.name, content: `Unknown tool: ${call.name}`, isError: true });
    } finally {
      if (previousToolOverride) {
        (context as any).__toolModelOverride = previousToolOverride;
      } else {
        delete (context as any).__toolModelOverride;
      }
    }
  }

  return results;
}

/**
 * Convert DB tool records to pi-ai Tool format.
 */
export function toProviderTools(
  dbTools: Array<{ name: string; description: string; parameters: any }>,
): Tool[] {
  return dbTools.map((t) => ({
    name: t.name,
    description: t.description,
    parameters: t.parameters || Type.Object({}),
  }));
}
