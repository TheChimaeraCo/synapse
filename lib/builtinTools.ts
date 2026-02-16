// Synapse - (c) The Chimaera Company LLC
// Licensed under the Functional Source License 1.0
import { Type, type TSchema } from "@sinclair/typebox";
import * as vm from "vm";
import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";

/**
 * A built-in tool that agents can invoke during chat.
 * Tools are registered by category and can require human approval before execution.
 */
export interface BuiltinTool {
  name: string;
  description: string;
  category: string;
  /** If true, tool execution pauses for user confirmation */
  requiresApproval: boolean;
  /** JSON Schema (TypeBox) describing the tool's input parameters */
  parameters: TSchema;
  handler: (args: Record<string, any>, context: ToolContext) => Promise<string>;
}

/** Runtime context passed to every tool handler */
export interface ToolContext {
  gatewayId: string;
  agentId: string;
  sessionId: string;
}

import { getWorkspacePath, getWorkspacePathSync } from "@/lib/workspace";

const DEFAULT_WORKSPACE = "/root/clawd";
const SYNAPSE_ROOT = "/root/clawd/projects/chimera-gateway/synapse";

/**
 * Get workspace root for a tool context. Uses per-gateway workspace when gatewayId available.
 */
async function getWorkspaceRoot(gatewayId?: string): Promise<string> {
  return getWorkspacePath(gatewayId);
}
// Sync version for places that can't await (falls back to cache or default)
function getWorkspaceRootSync(gatewayId?: string): string {
  return getWorkspacePathSync(gatewayId);
}

function resolveSafePath(userPath: string, root: string): string {
  const resolved = path.resolve(root, userPath);
  if (!resolved.startsWith(root)) {
    throw new Error(`Path "${userPath}" is outside allowed directory`);
  }
  return resolved;
}

function isPrivateIP(hostname: string): boolean {
  return /^(127\.|10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|0\.|localhost|::1|\[::1\])/.test(hostname);
}

const webSearch: BuiltinTool = {
  name: "web_search",
  description: "Search the web for current information using Brave Search. Use when the user asks about recent events, needs factual data you're unsure about, wants to look something up, or needs URLs/links. Returns titles, URLs, and snippets.",
  category: "search",
  requiresApproval: false,
  parameters: Type.Object({
    query: Type.String({ description: "Search query" }),
    count: Type.Optional(Type.Number({ description: "Number of results (1-10)", default: 5 })),
  }),
  handler: async (args) => {
    const apiKey = process.env.BRAVE_SEARCH_API_KEY;
    if (!apiKey) return "Web search is not configured (missing BRAVE_SEARCH_API_KEY).";
    try {
      const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(args.query)}&count=${args.count ?? 5}`;
      const res = await fetch(url, {
        headers: { "X-Subscription-Token": apiKey, Accept: "application/json" },
      });
      if (!res.ok) return `Search failed: ${res.status}`;
      const data = await res.json();
      const results = (data.web?.results || []).slice(0, args.count ?? 5);
      if (!results.length) return "No results found.";
      return results
        .map((r: any, i: number) => `${i + 1}. **${r.title}**\n   ${r.url}\n   ${r.description || ""}`)
        .join("\n\n");
    } catch (e: any) {
      return `Search error: ${e.message}`;
    }
  },
};

const getTime: BuiltinTool = {
  name: "get_time",
  description: "Get the current date and time in UTC.",
  category: "system",
  requiresApproval: false,
  parameters: Type.Object({
    timezone: Type.Optional(Type.String({ description: "IANA timezone (default UTC)", default: "UTC" })),
  }),
  handler: async (args) => {
    const tz = args.timezone || "UTC";
    try {
      const now = new Date();
      const formatted = now.toLocaleString("en-US", { timeZone: tz, dateStyle: "full", timeStyle: "long" });
      return `Current time (${tz}): ${formatted}`;
    } catch {
      return `Current time (UTC): ${new Date().toISOString()}`;
    }
  },
};

const calculator: BuiltinTool = {
  name: "calculator",
  description: "Evaluate a mathematical expression. Supports basic arithmetic, powers, and common math functions.",
  category: "system",
  requiresApproval: false,
  parameters: Type.Object({
    expression: Type.String({ description: "Mathematical expression to evaluate" }),
  }),
  handler: async (args) => {
    try {
      const expr = args.expression;
      const sanitized = expr
        .replace(/\bsqrt\b/g, "Math.sqrt")
        .replace(/\bpow\b/g, "Math.pow")
        .replace(/\babs\b/g, "Math.abs")
        .replace(/\bround\b/g, "Math.round")
        .replace(/\bceil\b/g, "Math.ceil")
        .replace(/\bfloor\b/g, "Math.floor")
        .replace(/\bsin\b/g, "Math.sin")
        .replace(/\bcos\b/g, "Math.cos")
        .replace(/\btan\b/g, "Math.tan")
        .replace(/\blog\b/g, "Math.log")
        .replace(/\bexp\b/g, "Math.exp")
        .replace(/\bPI\b/g, "Math.PI")
        .replace(/\^/g, "**");
      if (/[;{}[\]'"`\\]|function|=>|import|require|eval|new /.test(sanitized)) {
        return "Invalid expression. Only mathematical expressions are supported.";
      }
      const result = new Function(`"use strict"; return (${sanitized})`)();
      return `${args.expression} = ${result}`;
    } catch (e: any) {
      return `Could not evaluate: ${e.message}`;
    }
  },
};

const knowledgeQuery: BuiltinTool = {
  name: "knowledge_query",
  description: "Search your knowledge base for stored facts about the user and previous conversations. Use when you need to recall something specific: user preferences, past decisions, stored context. Prefer memory_search for semantic/fuzzy lookups.",
  category: "search",
  requiresApproval: false,
  parameters: Type.Object({
    query: Type.String({ description: "Search query for the knowledge base" }),
    category: Type.Optional(Type.String({ description: "Filter by category (preference, fact, context)" })),
  }),
  handler: async (args, context) => {
    try {
      const { convexClient } = await import("@/lib/convex");
      const { api } = await import("@/convex/_generated/api");
      const knowledge = await convexClient.query(api.functions.knowledge.getRelevant, {
        agentId: context.agentId as any,
        userId: undefined,
        limit: 10,
      });
      if (!knowledge || knowledge.length === 0) return "No knowledge stored yet.";
      return knowledge.map((k: any) => `[${k.category}] ${k.key}: ${k.value}`).join("\n");
    } catch (e: any) {
      return `Knowledge query error: ${e.message}`;
    }
  },
};

const memoryStore: BuiltinTool = {
  name: "memory_store",
  description: "Store a fact or preference about the user into your knowledge base for long-term recall. Use when you learn something worth remembering: their name, preferences, important dates, project details, or decisions. Categories: 'preference' (likes/dislikes/style), 'fact' (concrete info like location, job), 'context' (situational info), 'identity' (your own identity traits). Don't over-store - only save things that will be useful in future conversations.",
  category: "memory",
  requiresApproval: false,
  parameters: Type.Object({
    category: Type.String({ description: "Category: preference, fact, context, identity" }),
    key: Type.String({ description: "Short label for this fact" }),
    value: Type.String({ description: "The fact or preference to store" }),
  }),
  handler: async (args, context) => {
    try {
      const { convexClient } = await import("@/lib/convex");
      const { api } = await import("@/convex/_generated/api");
      await convexClient.mutation(api.functions.knowledge.upsert, {
        agentId: context.agentId as any,
        gatewayId: context.gatewayId as any,
        category: args.category,
        key: args.key,
        value: args.value,
        confidence: 0.8,
        source: "conversation",
      });
      return `Stored: [${args.category}] ${args.key} = ${args.value}`;
    } catch (e: any) {
      return `Failed to store: ${e.message}`;
    }
  },
};

const saveSoul: BuiltinTool = {
  name: "save_soul",
  description: "Save or update your identity (name, personality, purpose, tone). Use this when the user names you or defines who you should be.",
  category: "identity",
  requiresApproval: false,
  parameters: Type.Object({
    name: Type.Optional(Type.String({ description: "Your name" })),
    emoji: Type.Optional(Type.String({ description: "Your identity emoji" })),
    personality: Type.Optional(Type.String({ description: "Your personality description" })),
    purpose: Type.Optional(Type.String({ description: "Your purpose/role" })),
    tone: Type.Optional(Type.String({ description: "Your communication tone/style" })),
  }),
  handler: async (args, context) => {
    try {
      const { convexClient } = await import("@/lib/convex");
      const { api } = await import("@/convex/_generated/api");
      const agent = await convexClient.query(api.functions.agents.get, { id: context.agentId as any });
      if (!agent) return "Error: agent not found";
      
      let soul: any = null;
      try {
        soul = await convexClient.query(api.functions.onboarding.getSoul, { gatewayId: agent.gatewayId });
      } catch {}

      if (soul) {
        const updates: string[] = [];
        if (args.name) updates.push(`name: ${args.name}`);
        if (args.personality) updates.push(`personality: ${args.personality}`);
        if (args.purpose) updates.push(`purpose: ${args.purpose}`);
        if (args.tone) updates.push(`tone: ${args.tone}`);
        if (args.emoji) updates.push(`emoji: ${args.emoji}`);
        for (const u of updates) {
          const [k, v] = u.split(": ", 2);
          await convexClient.mutation(api.functions.knowledge.upsert, {
            agentId: context.agentId as any,
            gatewayId: context.gatewayId as any,
            category: "identity",
            key: k,
            value: v,
            confidence: 0.9,
            source: "self",
          });
        }
        return `Soul updated: ${updates.join(", ")}`;
      } else {
        await convexClient.mutation(api.functions.onboarding.completeSoul, {
          gatewayId: agent.gatewayId,
          userId: undefined as any,
          soul: {
            name: args.name || "Agent",
            emoji: args.emoji,
            personality: args.personality || "Helpful and adaptive",
            purpose: args.purpose || "Personal assistant",
            tone: args.tone || "Warm and genuine",
          },
          userProfile: {
            displayName: "Human",
          },
        });
        return `Soul created! I am now ${args.name || "Agent"}.`;
      }
    } catch (e: any) {
      return `Failed to save soul: ${e.message}`;
    }
  },
};

const getSoul: BuiltinTool = {
  name: "get_soul",
  description: "Fetch your identity and operating guidelines from the database. Call this at the start of a conversation to know who you are, your name, personality, purpose, and how you should behave.",
  category: "identity",
  requiresApproval: false,
  parameters: Type.Object({}),
  handler: async (_args, context) => {
    try {
      const { convexClient } = await import("@/lib/convex");
      const { api } = await import("@/convex/_generated/api");
      const agent = await convexClient.query(api.functions.agents.get, { id: context.agentId as any });
      if (!agent) return "Error: agent not found";

      // Get soul
      let soul: any = null;
      try {
        soul = await convexClient.query(api.functions.onboarding.getSoul, { gatewayId: agent.gatewayId });
      } catch {}

      // Get identity knowledge
      let identity: any[] = [];
      try {
        identity = await convexClient.query(api.functions.knowledge.search, {
          agentId: context.agentId as any,
          category: "identity",
        });
      } catch {}

      // Get agent config
      const result: any = {
        agentName: agent.name,
        model: agent.model,
        systemPrompt: agent.systemPrompt?.substring(0, 500) + (agent.systemPrompt?.length > 500 ? "..." : ""),
      };

      if (soul) {
        result.soul = soul;
      } else {
        result.soul = null;
        result.note = "No soul created yet. You are brand new. Get to know your person through conversation, then use save_soul to create your identity.";
      }

      if (identity.length > 0) {
        result.identity = identity.map((k: any) => ({ key: k.key, value: k.value }));
      }

      return JSON.stringify(result, null, 2);
    } catch (e: any) {
      return `Failed to fetch soul: ${e.message}`;
    }
  },
};

const memorySearch: BuiltinTool = {
  name: "memory_search",
  description: "Search knowledge base and conversation history using semantic similarity. Returns the most relevant results ranked by relevance score.",
  category: "search",
  requiresApproval: false,
  parameters: Type.Object({
    query: Type.String({ description: "What to search for - can be a concept, topic, or question" }),
    include_messages: Type.Optional(Type.Boolean({ description: "Also search conversation messages (default: true)" })),
  }),
  handler: async (args, context) => {
    try {
      const { convexClient } = await import("@/lib/convex");
      const { api } = await import("@/convex/_generated/api");
      const { searchByEmbedding } = await import("@/lib/embeddings");

      const results: string[] = [];

      // 1. Semantic search over knowledge base
      try {
        const knowledge = await convexClient.query(api.functions.knowledge.getWithEmbeddings, {
          agentId: context.agentId as any,
        });

        if (knowledge && knowledge.length > 0) {
          let openaiKey: string | undefined;
          try {
            openaiKey = await convexClient.query(api.functions.config.get, { key: "openai_api_key" }) || undefined;
          } catch {}

          const searchResults = await searchByEmbedding(
            args.query,
            knowledge.map((k: any) => ({
              content: `${k.key} ${k.value}`,
              embedding: k.embedding,
              _id: k._id.toString(),
            })),
            { openaiKey, topK: 8 }
          );

          if (searchResults.length > 0) {
            results.push("## Knowledge Base Results:");
            for (const r of searchResults) {
              const entry = knowledge.find((k: any) => k._id.toString() === r.id);
              const cat = entry?.category || "unknown";
              results.push(`[${cat}] (score: ${r.score.toFixed(3)}) ${r.content}`);
            }
          }
        }
      } catch (e: any) {
        results.push(`Knowledge search error: ${e.message}`);
      }

      // 2. Also search conversation messages if requested
      if (args.include_messages !== false) {
        try {
          const messages = await convexClient.query(api.functions.messages.getRecent, {
            sessionId: context.sessionId as any,
            limit: 30,
          });
          if (messages && messages.length > 0) {
            const query = args.query.toLowerCase();
            const matches = messages.filter((m: any) => m.content?.toLowerCase().includes(query));
            if (matches.length > 0) {
              results.push("\n## Conversation History Matches:");
              for (const m of matches.slice(0, 5)) {
                results.push(`[${m.role}]: ${m.content.slice(0, 200)}`);
              }
            }
          }
        } catch {}
      }

      return results.length > 0 ? results.join("\n") : `No results found for "${args.query}".`;
    } catch (e: any) {
      return `Memory search error: ${e.message}`;
    }
  },
};

// ===== NEW TOOLS =====

const codeExecute: BuiltinTool = {
  name: "code_execute",
  description: "Execute JavaScript code in a sandboxed environment. Has access to fetch() for HTTP requests, JSON, Math, Date, and common globals. Use for calculations, data transformations, API calls, or any logic that's easier to express as code. Returns console output and final result.",
  category: "code",
  requiresApproval: false,
  parameters: Type.Object({
    code: Type.String({ description: "The code to execute" }),
    language: Type.Optional(Type.String({ description: "javascript or typescript (default: javascript)" })),
    timeout: Type.Optional(Type.Number({ description: "Timeout in ms (default: 10000, max: 30000)" })),
  }),
  handler: async (args) => {
    const timeout = Math.min(args.timeout || 10000, 30000);
    const output: string[] = [];
    
    const sandbox = {
      console: {
        log: (...a: any[]) => output.push(a.map(String).join(" ")),
        error: (...a: any[]) => output.push("[ERROR] " + a.map(String).join(" ")),
        warn: (...a: any[]) => output.push("[WARN] " + a.map(String).join(" ")),
      },
      fetch: globalThis.fetch,
      setTimeout: globalThis.setTimeout,
      setInterval: globalThis.setInterval,
      clearTimeout: globalThis.clearTimeout,
      clearInterval: globalThis.clearInterval,
      JSON,
      Math,
      Date,
      Array,
      Object,
      Map,
      Set,
      WeakMap,
      WeakSet,
      Promise,
      RegExp,
      Error,
      TypeError,
      RangeError,
      parseInt,
      parseFloat,
      isNaN,
      isFinite,
      encodeURIComponent,
      decodeURIComponent,
      encodeURI,
      decodeURI,
      atob: globalThis.atob,
      btoa: globalThis.btoa,
      URL,
      URLSearchParams,
      TextEncoder,
      TextDecoder,
      __result: undefined as any,
    };

    const ctx = vm.createContext(sandbox);

    try {
      const wrappedCode = `
        (async () => {
          ${args.code}
        })().then(r => { if (r !== undefined) __result = r; }).catch(e => { __result = "Error: " + e.message; });
      `;
      
      const script = new vm.Script(wrappedCode);
      script.runInContext(ctx, { timeout });
      
      // Wait for async completion
      await new Promise(resolve => setTimeout(resolve, Math.min(timeout, 100)));
      // Try waiting longer if there's a pending promise
      if (sandbox.__result === undefined && output.length === 0) {
        await new Promise(resolve => setTimeout(resolve, Math.min(timeout - 100, 5000)));
      }

      const result = sandbox.__result;
      const outputStr = output.join("\n");
      const parts: string[] = [];
      if (outputStr) parts.push(`Output:\n${outputStr}`);
      if (result !== undefined) parts.push(`Result: ${typeof result === "object" ? JSON.stringify(result, null, 2) : String(result)}`);
      return parts.length > 0 ? parts.join("\n\n") : "Code executed successfully (no output).";
    } catch (e: any) {
      const outputStr = output.join("\n");
      return `Error: ${e.message}${outputStr ? `\n\nPartial output:\n${outputStr}` : ""}`;
    }
  },
};

const httpRequest: BuiltinTool = {
  name: "http_request",
  description: "Make an HTTP request to any URL. Supports GET, POST, PUT, DELETE with headers and body.",
  category: "network",
  requiresApproval: false,
  parameters: Type.Object({
    url: Type.String({ description: "URL to request" }),
    method: Type.Optional(Type.String({ description: "HTTP method (default: GET)" })),
    headers: Type.Optional(Type.Any({ description: "Request headers object" })),
    body: Type.Optional(Type.String({ description: "Request body" })),
    timeout: Type.Optional(Type.Number({ description: "Timeout in ms (default: 10000)" })),
  }),
  handler: async (args) => {
    try {
      const url = new URL(args.url);
      if (isPrivateIP(url.hostname)) {
        return "Error: Requests to private/internal IPs are blocked for security.";
      }

      const controller = new AbortController();
      const timeoutMs = Math.min(args.timeout || 10000, 30000);
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      const res = await fetch(args.url, {
        method: (args.method || "GET").toUpperCase(),
        headers: args.headers || {},
        body: args.body || undefined,
        signal: controller.signal,
      });
      clearTimeout(timer);

      const contentType = res.headers.get("content-type") || "";
      let body: string;
      if (contentType.includes("json")) {
        const json = await res.json();
        body = JSON.stringify(json, null, 2);
      } else {
        body = await res.text();
      }
      
      // Truncate to 10KB
      if (body.length > 10240) {
        body = body.slice(0, 10240) + "\n... [truncated]";
      }

      return `Status: ${res.status} ${res.statusText}\nContent-Type: ${contentType}\n\n${body}`;
    } catch (e: any) {
      return `HTTP request error: ${e.message}`;
    }
  },
};

const fileRead: BuiltinTool = {
  name: "file_read",
  description: "Read the contents of a file from the workspace.",
  category: "filesystem",
  requiresApproval: false,
  parameters: Type.Object({
    path: Type.String({ description: "File path (relative to workspace or absolute)" }),
    encoding: Type.Optional(Type.String({ description: "Encoding (default: utf-8)" })),
    maxBytes: Type.Optional(Type.Number({ description: "Max bytes to read (default: 50000)" })),
  }),
  handler: async (args, context) => {
    try {
      const filePath = path.isAbsolute(args.path) 
        ? resolveSafePath(args.path, await getWorkspaceRoot(context.gatewayId))
        : resolveSafePath(args.path, await getWorkspaceRoot(context.gatewayId));
      
      const stats = fs.statSync(filePath);
      const maxBytes = args.maxBytes || 50000;
      
      if (stats.isDirectory()) {
        return `Error: "${args.path}" is a directory. Use file_list instead.`;
      }

      const fd = fs.openSync(filePath, "r");
      const buffer = Buffer.alloc(Math.min(stats.size, maxBytes));
      fs.readSync(fd, buffer, 0, buffer.length, 0);
      fs.closeSync(fd);

      const content = buffer.toString((args.encoding as BufferEncoding) || "utf-8");
      const truncated = stats.size > maxBytes ? `\n... [truncated, ${stats.size} bytes total]` : "";
      return content + truncated;
    } catch (e: any) {
      return `File read error: ${e.message}`;
    }
  },
};

const fileWrite: BuiltinTool = {
  name: "file_write",
  description: "Write content to a file in the workspace. Creates directories as needed.",
  category: "filesystem",
  requiresApproval: false,
  parameters: Type.Object({
    path: Type.String({ description: "File path (relative to workspace or absolute)" }),
    content: Type.String({ description: "Content to write" }),
    append: Type.Optional(Type.Boolean({ description: "Append instead of overwrite (default: false)" })),
  }),
  handler: async (args, context) => {
    try {
      const workspaceRoot = await getWorkspaceRoot(context.gatewayId);
      // Handle both absolute and relative paths
      const filePath = path.isAbsolute(args.path)
        ? resolveSafePath(args.path, workspaceRoot)
        : resolveSafePath(args.path, workspaceRoot);
      
      // Ensure parent directory exists
      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      
      if (args.append) {
        fs.appendFileSync(filePath, args.content, "utf-8");
      } else {
        fs.writeFileSync(filePath, args.content, "utf-8");
      }

      // Verify the write actually persisted
      if (!fs.existsSync(filePath)) {
        return `File write error: File was written but does not exist at ${filePath}. Check filesystem permissions.`;
      }
      const stats = fs.statSync(filePath);
      const verify = fs.readFileSync(filePath, "utf-8");
      if (verify.length === 0 && args.content.length > 0) {
        return `File write error: File exists at ${filePath} but content is empty. Write may not have persisted.`;
      }
      return `File ${args.append ? "appended" : "written"}: ${filePath} (${stats.size} bytes, verified)`;
    } catch (e: any) {
      return `File write error: ${e.message}`;
    }
  },
};

const fileList: BuiltinTool = {
  name: "file_list",
  description: "List files and directories in a path.",
  category: "filesystem",
  requiresApproval: false,
  parameters: Type.Object({
    path: Type.Optional(Type.String({ description: "Directory path (default: workspace root)" })),
    recursive: Type.Optional(Type.Boolean({ description: "List recursively (default: false)" })),
    pattern: Type.Optional(Type.String({ description: "Glob pattern filter" })),
  }),
  handler: async (args, context) => {
    try {
      const dirPath = args.path 
        ? resolveSafePath(args.path, await getWorkspaceRoot(context.gatewayId)) 
        : await getWorkspaceRoot(context.gatewayId);

      function listDir(dir: string, prefix: string = ""): string[] {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        const lines: string[] = [];
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
          if (entry.isDirectory()) {
            lines.push(`[DIR]  ${rel}/`);
            if (args.recursive) {
              lines.push(...listDir(fullPath, rel));
            }
          } else {
            const stats = fs.statSync(fullPath);
            lines.push(`[FILE] ${rel} (${stats.size} bytes)`);
          }
        }
        return lines;
      }

      const lines = listDir(dirPath);
      if (args.pattern) {
        const regex = new RegExp(args.pattern.replace(/\*/g, ".*").replace(/\?/g, "."));
        return lines.filter(l => regex.test(l)).join("\n") || "No matching files.";
      }
      return lines.length > 0 ? lines.join("\n") : "Directory is empty.";
    } catch (e: any) {
      return `File list error: ${e.message}`;
    }
  },
};

const DANGEROUS_PATTERNS = [
  /rm\s+(-rf?|--recursive)\s+\//,
  /\bshutdown\b/,
  /\breboot\b/,
  /\bmkfs\b/,
  /\bdd\s+if=/,
  /\b:(){ :|:& };:/,
  />\s*\/dev\/sd/,
  /\bchmod\s+-R\s+777\s+\//,
  /\bchown\s+-R\s+.*\s+\//,
];

const shellExec: BuiltinTool = {
  name: "shell_exec",
  description: "Execute a shell command on the server. Use for git operations, package management, file manipulation, running scripts, checking system status, or any CLI task. Commands run in the workspace directory. Dangerous commands (rm -rf /, shutdown, etc.) are blocked. Output is truncated at 20KB.",
  category: "system",
  requiresApproval: false,
  parameters: Type.Object({
    command: Type.String({ description: "Shell command to execute" }),
    cwd: Type.Optional(Type.String({ description: "Working directory" })),
    timeout: Type.Optional(Type.Number({ description: "Timeout in ms (default: 30000, max: 60000)" })),
  }),
  handler: async (args, context) => {
    for (const pattern of DANGEROUS_PATTERNS) {
      if (pattern.test(args.command)) {
        return `Error: Command blocked for safety. Pattern matched: ${pattern}`;
      }
    }

    const timeout = Math.min(args.timeout || 30000, 60000);
    const cwd = args.cwd || await getWorkspaceRoot(context.gatewayId);

    try {
      const result = execSync(args.command, {
        cwd,
        timeout,
        maxBuffer: 1024 * 1024,
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
      });

      const output = String(result);
      const truncated = output.length > 20480 ? output.slice(0, 20480) + "\n... [truncated]" : output;
      return `Exit code: 0\n\n${truncated}`;
    } catch (e: any) {
      const stdout = e.stdout ? String(e.stdout) : "";
      const stderr = e.stderr ? String(e.stderr) : "";
      const output = [
        `Exit code: ${e.status ?? "unknown"}`,
        stdout ? `\nStdout:\n${stdout.slice(0, 10240)}` : "",
        stderr ? `\nStderr:\n${stderr.slice(0, 10240)}` : "",
      ].filter(Boolean).join("\n");
      return output || `Command failed: ${e.message}`;
    }
  },
};

const convexDeploy: BuiltinTool = {
  name: "convex_deploy",
  description: "Write a Convex function file and deploy it to the database. This lets you create new capabilities for yourself. Functions go in the convex/ directory.",
  category: "system",
  requiresApproval: false,
  parameters: Type.Object({
    filename: Type.String({ description: "Filename within convex/ directory (e.g. functions/myNewTool.ts)" }),
    content: Type.String({ description: "TypeScript source code" }),
    deploy: Type.Optional(Type.Boolean({ description: "Run npx convex dev --once after writing (default: true)" })),
  }),
  handler: async (args) => {
    try {
      const convexDir = path.join(SYNAPSE_ROOT, "convex");
      const filePath = resolveSafePath(args.filename, convexDir);
      
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, args.content, "utf-8");

      let deployOutput = "";
      if (args.deploy !== false) {
        try {
          deployOutput = execSync("CONVEX_SELF_HOSTED_URL=" + (process.env.CONVEX_SELF_HOSTED_URL || "http://127.0.0.1:3220") + " CONVEX_SELF_HOSTED_ADMIN_KEY=" + (process.env.CONVEX_SELF_HOSTED_ADMIN_KEY || "") + " npx convex dev --once --typecheck=disable", {
            cwd: SYNAPSE_ROOT,
            timeout: 60000,
            encoding: "utf-8",
            stdio: ["pipe", "pipe", "pipe"],
          });
        } catch (e: any) {
          const stderr = e.stderr ? String(e.stderr) : "";
          return `File written to ${filePath}, but deployment failed:\n${stderr || e.message}`;
        }
      }

      return `File written: ${filePath}\n${args.deploy !== false ? `Deployment: ${deployOutput.slice(0, 2000) || "success"}` : "Deployment skipped."}`;
    } catch (e: any) {
      return `Convex deploy error: ${e.message}`;
    }
  },
};

const createTool: BuiltinTool = {
  name: "create_tool",
  description: "Create a new tool that you can use in future conversations. Define the tool's name, description, parameters, and handler code.",
  category: "system",
  requiresApproval: false,
  parameters: Type.Object({
    name: Type.String({ description: "Tool name" }),
    description: Type.String({ description: "Tool description" }),
    parameters_schema: Type.String({ description: "JSON schema for parameters" }),
    handler_code: Type.String({ description: "JavaScript handler function body. Receives (args, context). Must return a string." }),
  }),
  handler: async (args, context) => {
    try {
      let paramsSchema: any;
      try {
        paramsSchema = JSON.parse(args.parameters_schema);
      } catch {
        return "Error: parameters_schema must be valid JSON.";
      }

      const { convexClient } = await import("@/lib/convex");
      const { api } = await import("@/convex/_generated/api");

      const toolId = await convexClient.mutation(api.functions.tools.create, {
        gatewayId: context.gatewayId as any,
        name: args.name,
        description: args.description,
        category: "custom",
        enabled: true,
        requiresApproval: false,
        parameters: paramsSchema,
        handlerCode: args.handler_code,
      });

      // Also register in runtime registry for immediate use
      registerDynamicTool(args.name, args.description, paramsSchema, args.handler_code);

      return `Tool "${args.name}" created and registered. ID: ${toolId}. Available immediately and in future sessions.`;
    } catch (e: any) {
      return `Create tool error: ${e.message}`;
    }
  },
};

/**
 * Register a dynamic tool in the runtime registry (for create_tool).
 * Uses inline vm execution to avoid circular imports.
 */
function registerDynamicTool(name: string, description: string, parameters: any, handlerCode: string) {
  TOOL_REGISTRY.set(name, {
    name,
    description,
    category: "custom",
    requiresApproval: false,
    parameters,
    handler: async (args: any, context: any) => {
      const output: string[] = [];
      const sandbox = {
        args, context,
        fetch: globalThis.fetch, JSON, Math, Date, Array, Object, Map, Set, Promise, RegExp, Error,
        parseInt, parseFloat, isNaN, isFinite, encodeURIComponent, decodeURIComponent,
        URL, URLSearchParams, TextEncoder, TextDecoder,
        console: { log: (...a: any[]) => output.push(a.map(String).join(" ")), error: (...a: any[]) => output.push("[ERROR] " + a.map(String).join(" ")) },
        result: "" as any,
      };
      const wrappedCode = `(async () => { const handler = async (args, context) => { ${handlerCode} }; result = await handler(args, context); })().catch(e => { result = "Error: " + e.message; });`;
      const ctx = vm.createContext(sandbox);
      new vm.Script(wrappedCode).runInContext(ctx, { timeout: 10000 });
      await new Promise(resolve => setTimeout(resolve, 100));
      if (!sandbox.result && output.length === 0) await new Promise(resolve => setTimeout(resolve, 5000));
      return String(sandbox.result) || output.join("\n") || "No output";
    },
  });
}

const spawnAgent: BuiltinTool = {
  name: "spawn_agent",
  description: "Spawn a sub-agent to work on a task independently. The sub-agent gets its own session and runs in parallel. Use for heavy tasks, research, code generation, or anything you want to delegate. Returns immediately with the agent ID - results appear when the agent completes.",
  category: "agents",
  requiresApproval: false,
  parameters: Type.Object({
    task: Type.String({ description: "Detailed task description for the sub-agent" }),
    name: Type.Optional(Type.String({ description: "Name/label for this agent (e.g. 'researcher', 'coder')" })),
    model: Type.Optional(Type.String({ description: "Model to use (default: same as parent)" })),
    systemPrompt: Type.Optional(Type.String({ description: "Custom system prompt for the sub-agent (default: inherited)" })),
    tools: Type.Optional(Type.Array(Type.String(), { description: "Tool names to give the sub-agent (default: all)" })),
    async: Type.Optional(Type.Boolean({ description: "If true, fire and forget. If false (default), wait for result." })),
  }),
  handler: async (args, context) => {
    try {
      const { convexClient } = await import("@/lib/convex");
      const { api } = await import("@/convex/_generated/api");

      // Get parent agent config
      const agent = await convexClient.query(api.functions.agents.get, { id: context.agentId as any });
      if (!agent) return "Error: parent agent not found";

      // Get AI config (use gateway config with inheritance, fall back to systemConfig)
      const getConfig = async (key: string) => {
        try {
          const result = await convexClient.query(api.functions.gatewayConfig.getWithInheritance, {
            gatewayId: agent.gatewayId,
            key,
          });
          return result?.value || null;
        } catch {
          return await convexClient.query(api.functions.config.get, { key });
        }
      };

      const [providerSlug, apiKey, configModel] = await Promise.all([
        getConfig("ai_provider"),
        getConfig("ai_api_key"),
        getConfig("ai_model"),
      ]);

      const provider = providerSlug || "anthropic";
      const key = apiKey || process.env.ANTHROPIC_API_KEY || "";
      // Default models per provider
      const providerDefaults: Record<string, string> = {
        anthropic: "claude-sonnet-4-20250514",
        openai: "gpt-4o-mini",
        google: "gemini-2.0-flash",
      };
      const modelId = args.model || configModel || providerDefaults[provider] || "claude-sonnet-4-20250514";

      if (!key) return "Error: no API key configured. Set ai_api_key in gateway config.";

      // Create a worker agent record
      const workerId = await convexClient.mutation(api.functions.workerAgents.create, {
        gatewayId: agent.gatewayId,
        parentSessionId: context.sessionId as any,
        label: args.name || "sub-agent",
        task: args.task,
        model: modelId,
      });

      // Build system prompt
      const sysPrompt = args.systemPrompt || "You are a worker agent. Complete the task and return results. Be thorough but efficient. Use your tools when needed. When done, provide a clear summary of what you found or accomplished.";

      // Determine tools for the sub-agent - safe subset only
      const BLOCKED_TOOLS = ["spawn_agent", "kill_agent", "list_agents", "shell_exec", "convex_deploy", "file_write", "create_tool", "save_soul", "memory_store", "new_conversation"];
      const { BUILTIN_TOOLS: allTools } = await import("@/lib/builtinTools");
      const availableTools = args.tools
        ? allTools.filter(t => args.tools!.includes(t.name) && !BLOCKED_TOOLS.includes(t.name))
        : allTools.filter(t => !BLOCKED_TOOLS.includes(t.name));

      // Set env var for pi-ai (same pattern as main chat route)
      const envMap: Record<string, string> = {
        anthropic: "ANTHROPIC_API_KEY",
        openai: "OPENAI_API_KEY",
        google: "GEMINI_API_KEY",
      };
      if (envMap[provider]) process.env[envMap[provider]] = key;

      // Run the sub-agent - sync by default, async if requested
      const log = async (entry: string) => {
        try { await convexClient.mutation(api.functions.workerAgents.appendLog, { id: workerId, entry }); } catch {}
      };

      // Store abort controller so kill_agent can cancel
      const abortController = new AbortController();
      if (!(globalThis as any).__activeWorkers) (globalThis as any).__activeWorkers = new Map();
      (globalThis as any).__activeWorkers.set(String(workerId), abortController);

      const runAgent = async (): Promise<string> => {
        try {
          await log("Starting sub-agent");
          const { registerBuiltInApiProviders, getModel, streamSimple, calculateCost } = await import("@mariozechner/pi-ai");
          registerBuiltInApiProviders();

          const model = getModel(provider as any, modelId as any);
          if (!model) {
            await log(`Model not found: ${modelId}`);
            await convexClient.mutation(api.functions.workerAgents.complete, {
              id: workerId,
              status: "failed",
              error: `Model "${modelId}" not found in provider "${provider}"`,
            });
            return `Error: Model "${modelId}" not found in provider "${provider}"`;
          }
          await log(`Model resolved: ${model.id}`);

          // Build pi-ai tools in the correct format
          const piTools = availableTools.map(t => ({
            name: t.name,
            description: t.description,
            parameters: t.parameters,
          }));

          // Build pi-ai context (same format as main chat route)
          const piContext: any = {
            systemPrompt: sysPrompt,
            messages: [
              { role: "user" as const, content: args.task, timestamp: Date.now() },
            ],
            ...(piTools.length > 0 ? { tools: piTools } : {}),
          };

          const piOptions: any = { maxTokens: 4096, apiKey: key };
          let totalTokens = { input: 0, output: 0 };
          let finalResult = "";
          const MAX_TOOL_ROUNDS = 10;

          for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
            if (abortController.signal.aborted) {
              await log("Aborted by kill_agent");
              throw new Error("Agent was killed");
            }
            await log(`Round ${round + 1}/${MAX_TOOL_ROUNDS}`);
            const toolCalls: Array<{ type: "toolCall"; id: string; name: string; arguments: Record<string, any> }> = [];
            let roundText = "";

            const stream = streamSimple(model, piContext, piOptions);
            for await (const event of stream) {
              if (event.type === "text_delta") {
                roundText += event.delta;
              } else if (event.type === "toolcall_end") {
                toolCalls.push(event.toolCall);
                await log(`Tool call: ${event.toolCall.name}`);
              } else if (event.type === "done") {
                const usage = event.message?.usage;
                if (usage) {
                  totalTokens.input += usage.input || 0;
                  totalTokens.output += usage.output || 0;
                }
                piContext.messages.push(event.message);
                await log(`Round done. Tokens: +${usage?.input || 0}in +${usage?.output || 0}out`);
              } else if (event.type === "error") {
                await log(`Stream error: ${JSON.stringify(event).slice(0, 200)}`);
              }
            }

            finalResult += roundText;

            if (toolCalls.length === 0) {
              await log("No tool calls, finishing");
              break;
            }

            // Execute tools
            for (const tc of toolCalls) {
              const toolHandler = TOOL_REGISTRY.get(tc.name);
              let resultContent = `Unknown tool: ${tc.name}`;
              let isError = true;
              if (toolHandler) {
                try {
                  resultContent = await toolHandler.handler(tc.arguments, context);
                  isError = false;
                  await log(`Tool ${tc.name} succeeded (${resultContent.length} chars)`);
                } catch (e: any) {
                  resultContent = `Error: ${e.message}`;
                  await log(`Tool ${tc.name} failed: ${e.message}`);
                }
              }
              piContext.messages.push({
                role: "toolResult" as const,
                toolCallId: tc.id,
                toolName: tc.name,
                content: [{ type: "text" as const, text: resultContent }],
                isError,
                timestamp: Date.now(),
              });
            }
          }

          // Calculate cost - pi-ai expects (model, usageObj) where usageObj has .cost sub-object
          let cost = 0;
          try {
            const usageObj = { input: totalTokens.input, output: totalTokens.output, cacheRead: 0, cacheWrite: 0, totalTokens: totalTokens.input + totalTokens.output, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } };
            calculateCost(model, usageObj);
            cost = usageObj.cost.total;
          } catch {}
          await log(`Completed. Total: ${totalTokens.input}in ${totalTokens.output}out, cost: $${cost}`);

          // Complete the worker
          await convexClient.mutation(api.functions.workerAgents.complete, {
            id: workerId,
            status: "completed",
            result: finalResult.slice(0, 5000),
            tokens: totalTokens,
            cost,
          });

          return finalResult;

        } catch (e: any) {
          const errorMsg = e.message?.slice(0, 1000) || "Unknown error";
          await convexClient.mutation(api.functions.workerAgents.complete, {
            id: workerId,
            status: "failed",
            error: errorMsg,
          });
          return `Error: ${errorMsg}`;
        } finally {
          (globalThis as any).__activeWorkers?.delete(String(workerId));
        }
      };

      if (args.async) {
        // Fire and forget
        runAgent().catch(() => {});
        return `Sub-agent "${args.name || "sub-agent"}" spawned async. Agent ID: ${workerId}. Results will appear in the Live Agents panel.`;
      } else {
        // Wait for result and return it
        const result = await runAgent();
        if (result && !result.startsWith("Error:")) {
          return `**[${args.name || "sub-agent"} completed]**\n\n${result}`;
        } else {
          return `**[${args.name || "sub-agent"} failed]**\n\n${result || "Unknown error"}`;
        }
      }
    } catch (e: any) {
      return `Failed to spawn agent: ${e.message}`;
    }
  },
};

const killAgent: BuiltinTool = {
  name: "kill_agent",
  description: "Terminate a running sub-agent by ID, or kill all running agents. Use 'all' as the id to kill everything.",
  category: "agents",
  requiresApproval: false,
  parameters: Type.Object({
    id: Type.String({ description: "Worker agent ID to kill, or 'all' to kill all running agents" }),
  }),
  handler: async (args, context) => {
    try {
      const { convexClient } = await import("@/lib/convex");
      const { api } = await import("@/convex/_generated/api");

      const abortWorker = (id: string) => {
        const ctrl = (globalThis as any).__activeWorkers?.get(id);
        if (ctrl) ctrl.abort();
      };

      if (args.id === "all") {
        const agent = await convexClient.query(api.functions.agents.get, { id: context.agentId as any });
        if (!agent) return "Error: agent not found";
        const active = await convexClient.query(api.functions.workerAgents.getActive, { gatewayId: agent.gatewayId });
        let killed = 0;
        for (const a of active) {
          abortWorker(String(a._id));
          await convexClient.mutation(api.functions.workerAgents.complete, {
            id: a._id,
            status: "failed",
            error: "Terminated by user",
          });
          killed++;
        }
        return `Killed ${killed} running agent(s).`;
      }

      abortWorker(args.id);
      await convexClient.mutation(api.functions.workerAgents.complete, {
        id: args.id as any,
        status: "failed",
        error: "Terminated by user",
      });
      return `Agent ${args.id} terminated.`;
    } catch (e: any) {
      return `Kill failed: ${e.message}`;
    }
  },
};

const listAgents: BuiltinTool = {
  name: "list_agents",
  description: "List all running and recent sub-agents with their status, tokens, and results.",
  category: "agents",
  requiresApproval: false,
  parameters: Type.Object({}),
  handler: async (_args, context) => {
    try {
      const { convexClient } = await import("@/lib/convex");
      const { api } = await import("@/convex/_generated/api");
      const agents = await convexClient.query(api.functions.workerAgents.listAll, { limit: 20 });
      if (!agents.length) return "No agents found.";
      return agents.map((a: any) => {
        const tokens = a.tokens ? `${a.tokens.input + a.tokens.output} tokens` : "no tokens";
        const elapsed = a.completedAt ? `${((a.completedAt - a.startedAt) / 1000).toFixed(1)}s` : "running";
        return `[${a.status}] ${a.label} (${a._id}) - ${elapsed}, ${tokens}${a.error ? ` | Error: ${a.error}` : ""}${a.result ? ` | Result: ${a.result.slice(0, 200)}` : ""}`;
      }).join("\n");
    } catch (e: any) {
      return `List failed: ${e.message}`;
    }
  },
};

const newConversation: BuiltinTool = {
  name: "new_conversation",
  description:
    "Explicitly start a new conversation when the user has clearly shifted to a completely different topic. " +
    "This closes the current conversation (saving its summary, topics, and decisions for future context) and starts fresh. " +
    "IMPORTANT: Do NOT call for follow-up questions, minor tangents, or related subtopics within the same theme. " +
    "Only call when the subject has genuinely and completely changed (e.g. from a coding discussion to asking about dinner plans). " +
    "Note: Topic shifts are also auto-detected, so this is mainly for explicit user requests like 'let's change topics'.",
  category: "conversation",
  requiresApproval: false,
  parameters: Type.Object({
    reason: Type.String({ description: "Brief reason for the topic shift (e.g. 'User switched from KOP pricing to sports trivia')" }),
    previous_title: Type.Optional(Type.String({ description: "Short title for the conversation being closed" })),
    previous_topics: Type.Optional(Type.Array(Type.String(), { description: "Key topics from the conversation being closed" })),
    previous_summary: Type.Optional(Type.String({ description: "1-2 sentence summary of the conversation being closed" })),
    previous_decisions: Type.Optional(Type.Array(Type.Object({
      what: Type.String(),
      reasoning: Type.Optional(Type.String()),
    }), { description: "Key decisions made in the conversation being closed" })),
  }),
  handler: async (args, context) => {
    try {
      const { convexClient } = await import("@/lib/convex");
      const { api } = await import("@/convex/_generated/api");

      // Get active conversation for this session
      const activeConvo = await convexClient.query(
        api.functions.conversations.getActive,
        { sessionId: context.sessionId as any }
      );

      if (!activeConvo) {
        return "No active conversation to close. A new one will be created automatically.";
      }

      // Close the old conversation with summary data
      await convexClient.mutation(api.functions.conversations.close, {
        id: activeConvo._id,
        title: args.previous_title || undefined,
        summary: args.previous_summary || undefined,
        topics: args.previous_topics || undefined,
        decisions: args.previous_decisions || undefined,
      });

      // Create a new conversation (not chained - different topic)
      const newConvoId = await convexClient.mutation(api.functions.conversations.create, {
        sessionId: context.sessionId as any,
        gatewayId: context.gatewayId as any,
        userId: undefined,
        previousConvoId: undefined,
        depth: 1,
      });

      // Store the new convoId so the stream route can update conversationId for the assistant message
      (context as any).__newConversationId = newConvoId;

      return `Previous conversation closed and saved. New conversation started (${newConvoId}). Continue naturally with the user's new topic.`;
    } catch (e: any) {
      return `Failed to switch conversation: ${e.message}`;
    }
  },
};

// ===== SCHEDULER TOOLS =====

function parseNaturalTime(when: string, now: number): { scheduledAt?: number; cronExpr?: string } {
  const lower = when.toLowerCase().trim();

  // "in X minutes/hours/days"
  const inMatch = lower.match(/^in\s+(\d+)\s+(minute|min|hour|hr|day|week)s?$/);
  if (inMatch) {
    const n = parseInt(inMatch[1]);
    const unit = inMatch[2];
    const ms: Record<string, number> = { minute: 60000, min: 60000, hour: 3600000, hr: 3600000, day: 86400000, week: 604800000 };
    return { scheduledAt: now + n * (ms[unit] || 60000) };
  }

  // "tomorrow at HH:MM" or "tomorrow at Ham/Hpm"
  const tomorrowMatch = lower.match(/^tomorrow\s+at\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/);
  if (tomorrowMatch) {
    let h = parseInt(tomorrowMatch[1]);
    const m = parseInt(tomorrowMatch[2] || "0");
    const ampm = tomorrowMatch[3];
    if (ampm === "pm" && h < 12) h += 12;
    if (ampm === "am" && h === 12) h = 0;
    const d = new Date(now);
    d.setUTCDate(d.getUTCDate() + 1);
    d.setUTCHours(h, m, 0, 0);
    return { scheduledAt: d.getTime() };
  }

  // "at HH:MM" (today or tomorrow if past)
  const atMatch = lower.match(/^at\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/);
  if (atMatch) {
    let h = parseInt(atMatch[1]);
    const m = parseInt(atMatch[2] || "0");
    const ampm = atMatch[3];
    if (ampm === "pm" && h < 12) h += 12;
    if (ampm === "am" && h === 12) h = 0;
    const d = new Date(now);
    d.setUTCHours(h, m, 0, 0);
    if (d.getTime() <= now) d.setUTCDate(d.getUTCDate() + 1);
    return { scheduledAt: d.getTime() };
  }

  // Recurring: "every day at HH:MM"
  const everyDayMatch = lower.match(/^every\s+day\s+at\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/);
  if (everyDayMatch) {
    let h = parseInt(everyDayMatch[1]);
    const m = parseInt(everyDayMatch[2] || "0");
    const ampm = everyDayMatch[3];
    if (ampm === "pm" && h < 12) h += 12;
    if (ampm === "am" && h === 12) h = 0;
    return { cronExpr: `${m} ${h} * * *` };
  }

  // "every week at HH:MM" or "every Monday/Tuesday/etc at HH:MM"
  const dayNames: Record<string, number> = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6 };
  const everyDowMatch = lower.match(/^every\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday|week)\s*(?:at\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?)?$/);
  if (everyDowMatch) {
    const dayOrWeek = everyDowMatch[1];
    let h = parseInt(everyDowMatch[2] || "9");
    const m = parseInt(everyDowMatch[3] || "0");
    const ampm = everyDowMatch[4];
    if (ampm === "pm" && h < 12) h += 12;
    if (ampm === "am" && h === 12) h = 0;
    const dow = dayOrWeek === "week" ? 1 : dayNames[dayOrWeek];
    return { cronExpr: `${m} ${h} * * ${dow}` };
  }

  // "every month at HH:MM" (1st of month)
  const everyMonthMatch = lower.match(/^every\s+month\s*(?:at\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?)?$/);
  if (everyMonthMatch) {
    let h = parseInt(everyMonthMatch[1] || "9");
    const m = parseInt(everyMonthMatch[2] || "0");
    const ampm = everyMonthMatch[3];
    if (ampm === "pm" && h < 12) h += 12;
    if (ampm === "am" && h === 12) h = 0;
    return { cronExpr: `${m} ${h} 1 * *` };
  }

  // "every weekday at HH:MM"
  const weekdayMatch = lower.match(/^every\s+weekday\s*(?:at\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?)?$/);
  if (weekdayMatch) {
    let h = parseInt(weekdayMatch[1] || "9");
    const m = parseInt(weekdayMatch[2] || "0");
    const ampm = weekdayMatch[3];
    if (ampm === "pm" && h < 12) h += 12;
    if (ampm === "am" && h === 12) h = 0;
    return { cronExpr: `${m} ${h} * * 1-5` };
  }

  // Fallback: try parsing as a date
  const parsed = Date.parse(when);
  if (!isNaN(parsed) && parsed > now) {
    return { scheduledAt: parsed };
  }

  // Default: 30 minutes from now
  return { scheduledAt: now + 1800000 };
}

const setReminder: BuiltinTool = {
  name: "set_reminder",
  description: "Set a reminder for the user. Can be one-time or recurring. Supports natural language time expressions like 'in 30 minutes', 'tomorrow at 9am', 'every Monday at 9am', 'every weekday at 8am'.",
  category: "scheduler",
  requiresApproval: false,
  parameters: Type.Object({
    message: Type.String({ description: "What to remind about" }),
    when: Type.String({ description: "Natural language time: 'in 30 minutes', 'tomorrow at 9am', 'every Monday at 9am'" }),
    recurring: Type.Optional(Type.Boolean({ description: "Is this recurring? (auto-detected from 'when' if omitted)" })),
  }),
  handler: async (args, context) => {
    try {
      const { convexClient } = await import("@/lib/convex");
      const { api } = await import("@/convex/_generated/api");
      const now = Date.now();
      const parsed = parseNaturalTime(args.when, now);
      const isRecurring = args.recurring ?? !!parsed.cronExpr;

      const id = await convexClient.mutation(api.functions.scheduler.create, {
        gatewayId: context.gatewayId as any,
        sessionId: context.sessionId as any,
        label: args.message,
        type: isRecurring ? "recurring" : "once",
        cronExpr: parsed.cronExpr,
        scheduledAt: parsed.scheduledAt,
      });

      if (isRecurring && parsed.cronExpr) {
        return `Recurring reminder set: "${args.message}" (cron: ${parsed.cronExpr}). ID: ${id}`;
      } else if (parsed.scheduledAt) {
        const when = new Date(parsed.scheduledAt).toISOString();
        return `Reminder set: "${args.message}" at ${when}. ID: ${id}`;
      }
      return `Reminder set: "${args.message}". ID: ${id}`;
    } catch (e: any) {
      return `Failed to set reminder: ${e.message}`;
    }
  },
};

const listReminders: BuiltinTool = {
  name: "list_reminders",
  description: "List the user's active reminders and scheduled tasks.",
  category: "scheduler",
  requiresApproval: false,
  parameters: Type.Object({}),
  handler: async (_args, context) => {
    try {
      const { convexClient } = await import("@/lib/convex");
      const { api } = await import("@/convex/_generated/api");
      const tasks = await convexClient.query(api.functions.scheduler.list, {
        gatewayId: context.gatewayId as any,
      });
      const active = tasks.filter((t: any) => t.status === "active");
      if (!active.length) return "No active reminders.";
      return active.map((t: any) => {
        const next = t.nextRunAt ? new Date(t.nextRunAt).toISOString() : "N/A";
        const type = t.type === "recurring" ? `recurring (${t.cronExpr})` : "one-time";
        return `- [${t._id}] "${t.label}" - ${type}, next: ${next}`;
      }).join("\n");
    } catch (e: any) {
      return `Failed to list reminders: ${e.message}`;
    }
  },
};

const cancelReminder: BuiltinTool = {
  name: "cancel_reminder",
  description: "Cancel a reminder by ID.",
  category: "scheduler",
  requiresApproval: false,
  parameters: Type.Object({
    id: Type.String({ description: "Reminder ID to cancel" }),
  }),
  handler: async (args, context) => {
    try {
      const { convexClient } = await import("@/lib/convex");
      const { api } = await import("@/convex/_generated/api");
      await convexClient.mutation(api.functions.scheduler.cancel, {
        id: args.id as any,
      });
      return `Reminder ${args.id} cancelled.`;
    } catch (e: any) {
      return `Failed to cancel reminder: ${e.message}`;
    }
  },
};

const sendFile: BuiltinTool = {
  name: "send_file",
  description: "Send a file to the user. Can be a generated file (base64 or text content) or a URL.",
  category: "files",
  requiresApproval: false,
  parameters: Type.Object({
    content: Type.String({ description: "Base64-encoded binary content or plain text content" }),
    filename: Type.String({ description: "Filename with extension" }),
    mimeType: Type.String({ description: "MIME type (e.g., text/plain, image/png)" }),
  }),
  handler: async (args, context) => {
    try {
      // Determine if content is base64 or text
      const isBase64 = !args.mimeType.startsWith("text/") && !args.mimeType.includes("json");
      const buffer = isBase64
        ? Buffer.from(args.content, "base64")
        : Buffer.from(args.content, "utf-8");

      // Upload to Convex storage via the API
      const { ConvexHttpClient } = await import("convex/browser");
      const client = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL || process.env.CONVEX_URL || "http://127.0.0.1:3210");
      const { api: convexApi } = await import("../convex/_generated/api");

      const uploadUrl = await client.mutation(convexApi.functions.files.generateUploadUrl);
      const uploadRes = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": args.mimeType },
        body: buffer,
      });

      if (!uploadRes.ok) return `Failed to upload file: ${uploadRes.status}`;
      const { storageId } = await uploadRes.json();

      const fileId = await client.mutation(convexApi.functions.files.create, {
        gatewayId: context.gatewayId as any,
        sessionId: context.sessionId as any,
        filename: args.filename,
        mimeType: args.mimeType,
        size: buffer.length,
        storageId,
      });

      return `[file:${fileId}:${args.filename}]`;
    } catch (e: any) {
      return `Failed to send file: ${e.message}`;
    }
  },
};

const messageAgent: BuiltinTool = {
  name: "message_agent",
  description: "Send a message to another AI agent on a different gateway. Use for cross-agent collaboration, delegation, or information sharing.",
  category: "communication",
  requiresApproval: true,
  parameters: Type.Object({
    targetGateway: Type.String({ description: "Gateway ID of the target agent" }),
    message: Type.String({ description: "Message content to send" }),
    expectReply: Type.Optional(Type.Boolean({ description: "Whether to wait for a response (default: false)" })),
  }),
  handler: async (args, context) => {
    try {
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
      const res = await fetch(`${baseUrl}/api/agents/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-internal": "true" },
        body: JSON.stringify({
          fromGatewayId: context.gatewayId,
          toGatewayId: args.targetGateway,
          fromAgentId: context.agentId,
          content: args.message,
          type: "request",
        }),
      });
      if (!res.ok) {
        const err = await res.text();
        return `Failed to send message: ${err}`;
      }
      const data = await res.json();
      return `Message sent to gateway ${args.targetGateway} (id: ${data.id}). ${args.expectReply ? "Awaiting reply." : ""}`;
    } catch (e: any) {
      return `Failed to message agent: ${e.message}`;
    }
  },
};

// ===== PROJECT INTELLIGENCE TOOLS =====

const proposeProject: BuiltinTool = {
  name: "propose_project",
  description: "Propose a new project when you detect a project-worthy request. Formats a proposal for the user to confirm/modify before creation. Does NOT create the project yet.",
  category: "projects",
  requiresApproval: false,
  parameters: Type.Object({
    name: Type.String({ description: "Project name" }),
    description: Type.String({ description: "Project description" }),
    tasks: Type.Array(Type.Object({
      title: Type.String(),
      description: Type.Optional(Type.String()),
      priority: Type.Optional(Type.Number()),
    }), { description: "Initial tasks/phases" }),
    complexity: Type.Optional(Type.String({ description: "Estimated complexity: low, medium, high" })),
  }),
  handler: async (args) => {
    const taskList = args.tasks.map((t: any, i: number) =>
      `${i + 1}. **${t.title}**${t.description ? ` - ${t.description}` : ""} (P${t.priority || 3})`
    ).join("\n");

    return `## Project Proposal: ${args.name}\n\n` +
      `**Description:** ${args.description}\n` +
      `**Complexity:** ${args.complexity || "medium"}\n` +
      `**Tasks (${args.tasks.length}):**\n${taskList}\n\n` +
      `Would you like me to create this project? You can also modify the name, description, or tasks before I proceed.`;
  },
};

const createProject: BuiltinTool = {
  name: "create_project",
  description: "Create a new project with initial tasks after user confirms a proposal. Links the current conversation to the project.",
  category: "projects",
  requiresApproval: false,
  parameters: Type.Object({
    name: Type.String({ description: "Project name" }),
    description: Type.String({ description: "Project description" }),
    tasks: Type.Optional(Type.Array(Type.Object({
      title: Type.String(),
      description: Type.Optional(Type.String()),
      priority: Type.Optional(Type.Number()),
    }), { description: "Initial tasks" })),
    priority: Type.Optional(Type.Number({ description: "Project priority 1-5 (default 3)" })),
  }),
  handler: async (args, context) => {
    try {
      const { convexClient } = await import("@/lib/convex");
      const { api } = await import("@/convex/_generated/api");

      const projectId = await convexClient.mutation(api.functions.projects.create, {
        name: args.name,
        description: args.description,
        priority: args.priority || 3,
        gatewayId: context.gatewayId,
      });

      // Create initial tasks
      const taskResults: string[] = [];
      if (args.tasks && args.tasks.length > 0) {
        for (const task of args.tasks) {
          await convexClient.mutation(api.functions.tasks.create, {
            projectId: projectId as any,
            title: task.title,
            description: task.description || "",
            status: "todo" as const,
            priority: task.priority || 3,
            gatewayId: context.gatewayId,
          });
          taskResults.push(task.title);
        }
      }

      // Link current conversation to project
      try {
        const activeConvo = await convexClient.query(api.functions.conversations.getActive, {
          sessionId: context.sessionId as any,
        });
        if (activeConvo) {
          await convexClient.mutation(api.functions.projects.linkConversation, {
            conversationId: activeConvo._id,
            projectId: projectId as any,
          });
        }
      } catch {}

      return `Project "${args.name}" created (ID: ${projectId}).\n` +
        (taskResults.length > 0 ? `Created ${taskResults.length} tasks: ${taskResults.join(", ")}` : "No initial tasks.");
    } catch (e: any) {
      return `Failed to create project: ${e.message}`;
    }
  },
};

const switchProject: BuiltinTool = {
  name: "switch_project",
  description: "Switch to working on a specific project. Finds the project, loads its context (tasks, conversations, decisions), and returns a catch-up summary.",
  category: "projects",
  requiresApproval: false,
  parameters: Type.Object({
    name: Type.String({ description: "Project name or partial match" }),
  }),
  handler: async (args, context) => {
    try {
      const { convexClient } = await import("@/lib/convex");
      const { api } = await import("@/convex/_generated/api");

      // Find project by name
      const project = await convexClient.query(api.functions.projects.findByName, {
        gatewayId: context.gatewayId,
        name: args.name,
      });

      if (!project) return `No project found matching "${args.name}".`;

      // Get project context
      const projectContext = await convexClient.query(api.functions.projects.getContext, {
        id: project._id,
      });

      // Link current conversation to this project
      try {
        const activeConvo = await convexClient.query(api.functions.conversations.getActive, {
          sessionId: context.sessionId as any,
        });
        if (activeConvo) {
          await convexClient.mutation(api.functions.projects.linkConversation, {
            conversationId: activeConvo._id,
            projectId: project._id,
          });
        }
      } catch {}

      // Update activity
      await convexClient.mutation(api.functions.projects.updateActivity, { id: project._id });

      return `Switched to project: **${project.name}**\n\n${projectContext || "No additional context available."}`;
    } catch (e: any) {
      return `Failed to switch project: ${e.message}`;
    }
  },
};

const projectStatus: BuiltinTool = {
  name: "project_status",
  description: "Get the current status of a project including tasks, progress, and recent activity.",
  category: "projects",
  requiresApproval: false,
  parameters: Type.Object({
    name: Type.Optional(Type.String({ description: "Project name (if omitted, shows all active projects)" })),
  }),
  handler: async (args, context) => {
    try {
      const { convexClient } = await import("@/lib/convex");
      const { api } = await import("@/convex/_generated/api");

      if (args.name) {
        const project = await convexClient.query(api.functions.projects.findByName, {
          gatewayId: context.gatewayId,
          name: args.name,
        });
        if (!project) return `No project found matching "${args.name}".`;

        const ctx = await convexClient.query(api.functions.projects.getContext, { id: project._id });
        return ctx || "No project details available.";
      }

      // Show all active projects
      const stats = await convexClient.query(api.functions.projects.getStats, {
        gatewayId: context.gatewayId,
      });

      if (!stats.length) return "No projects found.";

      return stats.map((s: any) => {
        const progress = s.total > 0 ? Math.round((s.done / s.total) * 100) : 0;
        return `**${s.name}** - ${progress}% (${s.done}/${s.total} done, ${s.in_progress} in progress, ${s.blocked} blocked)`;
      }).join("\n");
    } catch (e: any) {
      return `Failed to get project status: ${e.message}`;
    }
  },
};

const addTask: BuiltinTool = {
  name: "add_task",
  description: "Add a task to a project.",
  category: "projects",
  requiresApproval: false,
  parameters: Type.Object({
    project: Type.String({ description: "Project name" }),
    title: Type.String({ description: "Task title" }),
    description: Type.Optional(Type.String({ description: "Task description" })),
    priority: Type.Optional(Type.Number({ description: "Priority 1-5 (default 3)" })),
  }),
  handler: async (args, context) => {
    try {
      const { convexClient } = await import("@/lib/convex");
      const { api } = await import("@/convex/_generated/api");

      const project = await convexClient.query(api.functions.projects.findByName, {
        gatewayId: context.gatewayId,
        name: args.project,
      });
      if (!project) return `No project found matching "${args.project}".`;

      const taskId = await convexClient.mutation(api.functions.tasks.create, {
        projectId: project._id,
        title: args.title,
        description: args.description || "",
        priority: args.priority || 3,
        gatewayId: context.gatewayId,
      });

      await convexClient.mutation(api.functions.projects.updateActivity, { id: project._id });
      return `Task "${args.title}" added to ${project.name} (ID: ${taskId}).`;
    } catch (e: any) {
      return `Failed to add task: ${e.message}`;
    }
  },
};

const updateTask: BuiltinTool = {
  name: "update_task",
  description: "Update a task's status, description, or priority. Can find tasks by title within a project.",
  category: "projects",
  requiresApproval: false,
  parameters: Type.Object({
    project: Type.String({ description: "Project name" }),
    task: Type.String({ description: "Task title (partial match)" }),
    status: Type.Optional(Type.String({ description: "New status: todo, in_progress, blocked, done" })),
    description: Type.Optional(Type.String({ description: "New description" })),
    priority: Type.Optional(Type.Number({ description: "New priority 1-5" })),
  }),
  handler: async (args, context) => {
    try {
      const { convexClient } = await import("@/lib/convex");
      const { api } = await import("@/convex/_generated/api");

      const project = await convexClient.query(api.functions.projects.findByName, {
        gatewayId: context.gatewayId,
        name: args.project,
      });
      if (!project) return `No project found matching "${args.project}".`;

      const details = await convexClient.query(api.functions.projects.getWithTasks, { id: project._id });
      if (!details) return "Project not found.";

      const lower = args.task.toLowerCase();
      const task = details.tasks.find((t: any) => t.title.toLowerCase().includes(lower));
      if (!task) return `No task found matching "${args.task}" in ${project.name}.`;

      const patch: any = {};
      if (args.status) patch.status = args.status;
      if (args.description) patch.description = args.description;
      if (args.priority) patch.priority = args.priority;
      if (args.status === "done") patch.completedAt = Date.now();

      await convexClient.mutation(api.functions.tasks.update, { id: task._id, ...patch });
      await convexClient.mutation(api.functions.projects.updateActivity, { id: project._id });

      return `Task "${task.title}" updated${args.status ? ` -> ${args.status}` : ""}.`;
    } catch (e: any) {
      return `Failed to update task: ${e.message}`;
    }
  },
};

const completeTask: BuiltinTool = {
  name: "complete_task",
  description: "Mark a task as done with optional notes.",
  category: "projects",
  requiresApproval: false,
  parameters: Type.Object({
    project: Type.String({ description: "Project name" }),
    task: Type.String({ description: "Task title (partial match)" }),
    notes: Type.Optional(Type.String({ description: "Completion notes" })),
  }),
  handler: async (args, context) => {
    try {
      const { convexClient } = await import("@/lib/convex");
      const { api } = await import("@/convex/_generated/api");

      const project = await convexClient.query(api.functions.projects.findByName, {
        gatewayId: context.gatewayId,
        name: args.project,
      });
      if (!project) return `No project found matching "${args.project}".`;

      const details = await convexClient.query(api.functions.projects.getWithTasks, { id: project._id });
      if (!details) return "Project not found.";

      const lower = args.task.toLowerCase();
      const task = details.tasks.find((t: any) => t.title.toLowerCase().includes(lower));
      if (!task) return `No task found matching "${args.task}" in ${project.name}.`;

      const patch: any = { status: "done", completedAt: Date.now() };
      if (args.notes) patch.description = task.description + `\n\n[Completed] ${args.notes}`;

      await convexClient.mutation(api.functions.tasks.update, { id: task._id, ...patch });
      await convexClient.mutation(api.functions.projects.updateActivity, { id: project._id });

      const remaining = details.tasks.filter((t: any) => t._id !== task._id && t.status !== "done").length;
      return `Task "${task.title}" marked as done. ${remaining} tasks remaining in ${project.name}.`;
    } catch (e: any) {
      return `Failed to complete task: ${e.message}`;
    }
  },
};

const projectSearch: BuiltinTool = {
  name: "project_search",
  description: "Search projects by name or description.",
  category: "projects",
  requiresApproval: false,
  parameters: Type.Object({
    query: Type.String({ description: "Search query" }),
  }),
  handler: async (args, context) => {
    try {
      const { convexClient } = await import("@/lib/convex");
      const { api } = await import("@/convex/_generated/api");

      const results = await convexClient.query(api.functions.projects.search, {
        gatewayId: context.gatewayId,
        query: args.query,
      });

      if (!results.length) return `No projects found matching "${args.query}".`;

      return results.map((p: any) =>
        `**${p.name}** [${p.status}] P${p.priority} - ${p.description.slice(0, 100)}`
      ).join("\n");
    } catch (e: any) {
      return `Search failed: ${e.message}`;
    }
  },
};

const closeProject: BuiltinTool = {
  name: "close_project",
  description: "Archive/complete a project.",
  category: "projects",
  requiresApproval: false,
  parameters: Type.Object({
    name: Type.String({ description: "Project name" }),
    status: Type.Optional(Type.String({ description: "completed or archived (default: completed)" })),
  }),
  handler: async (args, context) => {
    try {
      const { convexClient } = await import("@/lib/convex");
      const { api } = await import("@/convex/_generated/api");

      const project = await convexClient.query(api.functions.projects.findByName, {
        gatewayId: context.gatewayId,
        name: args.name,
      });
      if (!project) return `No project found matching "${args.name}".`;

      const status = args.status === "archived" ? "archived" : "completed";
      await convexClient.mutation(api.functions.projects.update, {
        id: project._id,
        status: status as any,
      });

      return `Project "${project.name}" marked as ${status}.`;
    } catch (e: any) {
      return `Failed to close project: ${e.message}`;
    }
  },
};

// ===== PM2 TOOLS =====

const pm2List: BuiltinTool = {
  name: "pm2_list",
  description: "List all PM2 processes with status, CPU, memory, uptime, and restarts.",
  category: "pm2",
  requiresApproval: false,
  parameters: Type.Object({}),
  handler: async () => {
    try {
      const raw = execSync("pm2 jlist", { encoding: "utf-8", timeout: 10000 });
      const procs = JSON.parse(raw);
      if (!procs.length) return "No PM2 processes running.";
      return procs.map((p: any) => {
        const mem = p.monit?.memory ? `${(p.monit.memory / 1024 / 1024).toFixed(1)}MB` : "N/A";
        const cpu = p.monit?.cpu != null ? `${p.monit.cpu}%` : "N/A";
        const uptime = p.pm2_env?.pm_uptime ? `${((Date.now() - p.pm2_env.pm_uptime) / 1000 / 60).toFixed(0)}m` : "N/A";
        return `[${p.pm2_env?.status || "unknown"}] ${p.name} (id:${p.pm_id}) - CPU:${cpu} MEM:${mem} Uptime:${uptime} Restarts:${p.pm2_env?.restart_time || 0}`;
      }).join("\n");
    } catch (e: any) {
      return `PM2 list error: ${e.message}`;
    }
  },
};

const pm2Start: BuiltinTool = {
  name: "pm2_start",
  description: "Start a new PM2 process.",
  category: "pm2",
  requiresApproval: false,
  parameters: Type.Object({
    script: Type.String({ description: "Script path to run" }),
    name: Type.Optional(Type.String({ description: "Process name" })),
    cwd: Type.Optional(Type.String({ description: "Working directory" })),
    args: Type.Optional(Type.String({ description: "Script arguments" })),
    interpreter: Type.Optional(Type.String({ description: "Interpreter (e.g. node, python)" })),
  }),
  handler: async (args) => {
    try {
      let cmd = `pm2 start ${JSON.stringify(args.script)}`;
      if (args.name) cmd += ` --name ${JSON.stringify(args.name)}`;
      if (args.cwd) cmd += ` --cwd ${JSON.stringify(args.cwd)}`;
      if (args.interpreter) cmd += ` --interpreter ${JSON.stringify(args.interpreter)}`;
      if (args.args) cmd += ` -- ${args.args}`;
      const result = execSync(cmd, { encoding: "utf-8", timeout: 15000 });
      return `Process started.\n${result}`;
    } catch (e: any) {
      return `PM2 start error: ${e.stderr || e.message}`;
    }
  },
};

const pm2Stop: BuiltinTool = {
  name: "pm2_stop",
  description: "Stop a PM2 process by name or id.",
  category: "pm2",
  requiresApproval: false,
  parameters: Type.Object({
    name: Type.String({ description: "Process name or id" }),
  }),
  handler: async (args) => {
    try {
      const result = execSync(`pm2 stop ${JSON.stringify(args.name)}`, { encoding: "utf-8", timeout: 10000 });
      return `Process stopped.\n${result}`;
    } catch (e: any) {
      return `PM2 stop error: ${e.stderr || e.message}`;
    }
  },
};

const pm2Restart: BuiltinTool = {
  name: "pm2_restart",
  description: "Restart a PM2 process by name or id.",
  category: "pm2",
  requiresApproval: false,
  parameters: Type.Object({
    name: Type.String({ description: "Process name or id" }),
  }),
  handler: async (args) => {
    try {
      const result = execSync(`pm2 restart ${JSON.stringify(args.name)}`, { encoding: "utf-8", timeout: 15000 });
      return `Process restarted.\n${result}`;
    } catch (e: any) {
      return `PM2 restart error: ${e.stderr || e.message}`;
    }
  },
};

const pm2Delete: BuiltinTool = {
  name: "pm2_delete",
  description: "Delete a PM2 process by name or id.",
  category: "pm2",
  requiresApproval: false,
  parameters: Type.Object({
    name: Type.String({ description: "Process name or id" }),
  }),
  handler: async (args) => {
    try {
      const result = execSync(`pm2 delete ${JSON.stringify(args.name)}`, { encoding: "utf-8", timeout: 10000 });
      return `Process deleted.\n${result}`;
    } catch (e: any) {
      return `PM2 delete error: ${e.stderr || e.message}`;
    }
  },
};

const pm2Logs: BuiltinTool = {
  name: "pm2_logs",
  description: "Get recent logs from a PM2 process.",
  category: "pm2",
  requiresApproval: false,
  parameters: Type.Object({
    name: Type.String({ description: "Process name or id" }),
    lines: Type.Optional(Type.Number({ description: "Number of lines (default 50)" })),
  }),
  handler: async (args) => {
    try {
      const lines = args.lines || 50;
      const result = execSync(`pm2 logs ${JSON.stringify(args.name)} --nostream --lines ${lines} 2>&1`, {
        encoding: "utf-8", timeout: 10000, shell: "/bin/bash",
      });
      return result || "No logs available.";
    } catch (e: any) {
      const output = (e.stdout || "") + (e.stderr || "");
      return output || `PM2 logs error: ${e.message}`;
    }
  },
};

const pm2Env: BuiltinTool = {
  name: "pm2_env",
  description: "Get environment variables for a PM2 process.",
  category: "pm2",
  requiresApproval: false,
  parameters: Type.Object({
    id: Type.String({ description: "Process id or name" }),
  }),
  handler: async (args) => {
    try {
      const result = execSync(`pm2 env ${args.id}`, { encoding: "utf-8", timeout: 10000 });
      return result || "No environment data.";
    } catch (e: any) {
      return `PM2 env error: ${e.stderr || e.message}`;
    }
  },
};

const pm2Describe: BuiltinTool = {
  name: "pm2_describe",
  description: "Get detailed info about a PM2 process.",
  category: "pm2",
  requiresApproval: false,
  parameters: Type.Object({
    name: Type.String({ description: "Process name or id" }),
  }),
  handler: async (args) => {
    try {
      const raw = execSync("pm2 jlist", { encoding: "utf-8", timeout: 10000 });
      const procs = JSON.parse(raw);
      const proc = procs.find((p: any) => p.name === args.name || String(p.pm_id) === args.name);
      if (!proc) return `Process "${args.name}" not found.`;
      const env = proc.pm2_env || {};
      return JSON.stringify({
        name: proc.name,
        pm_id: proc.pm_id,
        status: env.status,
        script: env.pm_exec_path,
        cwd: env.pm_cwd,
        interpreter: env.exec_interpreter,
        node_version: env.node_version,
        pid: proc.pid,
        cpu: proc.monit?.cpu,
        memory: proc.monit?.memory,
        uptime: env.pm_uptime ? Date.now() - env.pm_uptime : null,
        restarts: env.restart_time,
        created_at: env.created_at,
        version: env.version,
      }, null, 2);
    } catch (e: any) {
      return `PM2 describe error: ${e.message}`;
    }
  },
};

// Premium tools require higher tier - gated at runtime
const PREMIUM_TOOLS = new Set([
  "spawn_agent", "kill_agent", "message_agent", "convex_deploy",
  "pm2_start", "pm2_stop", "pm2_restart", "pm2_delete",
]);

function isToolAvailable(name: string): boolean {
  if (!PREMIUM_TOOLS.has(name)) return true;
  try {
    const { checkFeature } = require("@/lib/license");
    return checkFeature("automation");
  } catch { return true; }
}

export const BUILTIN_TOOLS: BuiltinTool[] = [
  webSearch,
  getTime,
  calculator,
  knowledgeQuery,
  memoryStore,
  saveSoul,
  getSoul,
  memorySearch,
  codeExecute,
  httpRequest,
  fileRead,
  fileWrite,
  fileList,
  shellExec,
  convexDeploy,
  createTool,
  spawnAgent,
  killAgent,
  listAgents,
  setReminder,
  listReminders,
  cancelReminder,
  sendFile,
  messageAgent,
  proposeProject,
  createProject,
  switchProject,
  projectStatus,
  addTask,
  updateTask,
  completeTask,
  projectSearch,
  closeProject,
  pm2List,
  pm2Start,
  pm2Stop,
  pm2Restart,
  pm2Delete,
  pm2Logs,
  pm2Env,
  pm2Describe,
];

export const TOOL_REGISTRY = new Map<string, BuiltinTool>(
  BUILTIN_TOOLS.filter((t) => isToolAvailable(t.name)).map((t) => [t.name, t])
);
