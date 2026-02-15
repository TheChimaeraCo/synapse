// Synapse - (c) The Chimaera Company LLC
// Licensed under the Functional Source License 1.0
import { TOOL_REGISTRY, type ToolContext } from "./builtinTools";
import type { ToolCall, Tool } from "@mariozechner/pi-ai";
import { Type } from "@sinclair/typebox";
import * as vm from "vm";

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
    // 1. Check builtin registry first
    const handler = TOOL_REGISTRY.get(call.name);
    if (handler) {
      try {
        const output = await handler.handler(call.arguments, context);
        results.push({ toolCallId: call.id, toolName: call.name, content: output, isError: false });
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
