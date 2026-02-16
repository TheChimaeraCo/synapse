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
  dbTools?: Array<{ name: string; handlerCode?: string }>,
): Promise<ToolResult[]> {
  const results: ToolResult[] = [];

  // Build a map of DB tools with handler code
  const dbToolMap = new Map<string, string>();
  if (dbTools) {
    for (const t of dbTools) {
      if (t.handlerCode) dbToolMap.set(t.name, t.handlerCode);
    }
  }

  for (const call of toolCalls) {
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
    const handler = TOOL_REGISTRY.get(call.name);
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
    const handlerCode = dbToolMap.get(call.name);
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
