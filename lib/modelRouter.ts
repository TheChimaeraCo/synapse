// Synapse - (c) The Chimaera Company LLC
// Licensed under the Functional Source License 1.0
/**
 * Model Router - selects optimal model based on task classification, rules, and budget.
 */

export type TaskType = "chat" | "tool_use" | "summary" | "code" | "analysis";

export interface ModelRoutingConfig {
  chat: string;
  tool_use: string;
  summary: string;
  code: string;
  analysis?: string;
}

export interface BudgetState {
  allowed: boolean;
  suggestedModel?: string;
  remainingUsd?: number;
}

export interface ModelRoute {
  _id?: string;
  name: string;
  description: string;
  condition: RouteCondition;
  targetModel: string;
  priority: number;
  enabled: boolean;
}

export interface RouteCondition {
  type: "message_length" | "has_code" | "keyword" | "combined";
  // message_length
  minLength?: number;
  maxLength?: number;
  // has_code
  codeDetection?: boolean;
  // keyword
  keywords?: string[];
  // combined - all sub-conditions must match
  conditions?: RouteCondition[];
}

// Ordered cheapest-last fallback chains per provider family
const FALLBACK_CHAINS: Record<string, string[]> = {
  anthropic: ["claude-opus-4-20250514", "claude-sonnet-4-20250514", "claude-haiku-3-20250514"],
  openai: ["gpt-4o", "gpt-4o-mini"],
  google: ["gemini-2.5-pro", "gemini-2.5-flash", "gemini-2.0-flash"],
};

const DEFAULT_ROUTING: ModelRoutingConfig = {
  chat: "claude-sonnet-4-20250514",
  tool_use: "claude-sonnet-4-20250514",
  summary: "claude-haiku-3-20250514",
  code: "claude-sonnet-4-20250514",
  analysis: "claude-sonnet-4-20250514",
};

// --- Heuristic classifier ---

const CODE_PATTERNS = [
  /```[\s\S]*?```/,
  /\b(function|const|let|var|class|import|export|return|if|else|for|while)\s/,
  /[{}\[\]();]=>/,
  /\b(def|print|lambda|yield)\b/,
  /\b(SELECT|INSERT|UPDATE|DELETE|CREATE|ALTER)\b/i,
];

const ANALYSIS_KEYWORDS = [
  "analyze", "analysis", "compare", "evaluate", "review", "assess",
  "explain why", "pros and cons", "trade-offs", "deep dive", "breakdown",
  "investigate", "research", "strategy", "architecture", "design",
];

const SIMPLE_PATTERNS = [
  /^(hi|hello|hey|thanks|thank you|ok|okay|yes|no|sure|got it)/i,
  /^.{0,30}(\?)?$/,  // Very short messages
];

export function classifyMessage(message: string): TaskType {
  const trimmed = message.trim();

  // Simple/short messages -> chat (cheap model)
  if (trimmed.length < 40 && SIMPLE_PATTERNS.some(p => p.test(trimmed))) {
    return "chat";
  }

  // Code detection
  if (CODE_PATTERNS.some(p => p.test(trimmed))) {
    return "code";
  }

  // Analysis keywords
  const lower = trimmed.toLowerCase();
  if (ANALYSIS_KEYWORDS.some(kw => lower.includes(kw))) {
    return "analysis";
  }

  // Long messages suggest more complex tasks
  if (trimmed.length > 500) {
    return "analysis";
  }

  // Summary requests
  if (/\b(summarize|summary|tldr|tl;dr|recap)\b/i.test(lower)) {
    return "summary";
  }

  return "chat";
}

export function evaluateCondition(condition: RouteCondition, message: string): boolean {
  switch (condition.type) {
    case "message_length":
      if (condition.minLength !== undefined && message.length < condition.minLength) return false;
      if (condition.maxLength !== undefined && message.length > condition.maxLength) return false;
      return true;

    case "has_code":
      return condition.codeDetection ? CODE_PATTERNS.some(p => p.test(message)) : !CODE_PATTERNS.some(p => p.test(message));

    case "keyword":
      if (!condition.keywords?.length) return false;
      const lower = message.toLowerCase();
      return condition.keywords.some(kw => lower.includes(kw.toLowerCase()));

    case "combined":
      if (!condition.conditions?.length) return false;
      return condition.conditions.every(c => evaluateCondition(c, message));

    default:
      return false;
  }
}

function getCheaperAlternative(model: string): string | null {
  for (const chain of Object.values(FALLBACK_CHAINS)) {
    const idx = chain.indexOf(model);
    if (idx >= 0 && idx < chain.length - 1) {
      return chain[idx + 1];
    }
  }
  return null;
}

function getCheapest(model: string): string {
  for (const chain of Object.values(FALLBACK_CHAINS)) {
    if (chain.includes(model)) {
      return chain[chain.length - 1];
    }
  }
  return model;
}

/**
 * Select model using custom routes first, then fall back to task-based routing.
 */
export function selectModel(
  taskType: TaskType,
  routing: ModelRoutingConfig | null,
  budget: BudgetState,
  agentModel?: string,
  message?: string,
  customRoutes?: ModelRoute[],
): string {
  const config = routing || DEFAULT_ROUTING;

  // Check custom routes first (sorted by priority, highest first)
  if (message && customRoutes?.length) {
    const sorted = [...customRoutes].filter(r => r.enabled).sort((a, b) => b.priority - a.priority);
    for (const route of sorted) {
      if (evaluateCondition(route.condition, message)) {
        return route.targetModel;
      }
    }
  }

  // Start with task-specific model, fall back to agent config
  let model = config[taskType] || agentModel || config.chat;

  // Custom model routing requires team tier or above
  if (routing && routing !== DEFAULT_ROUTING) {
    try {
      const { checkFeature } = require("@/lib/license");
      if (!checkFeature("custom_models")) {
        model = DEFAULT_ROUTING[taskType] || DEFAULT_ROUTING.chat;
      }
    } catch { /* license module not available in all contexts */ }
  }

  // If budget suggests a cheaper model, use it
  if (budget.suggestedModel) {
    const suggested = budget.suggestedModel;
    const cheaper = getCheaperAlternative(model);
    if (cheaper) {
      model = suggested;
    }
  }

  // If very low budget (< $0.01 remaining), force cheapest
  if (budget.remainingUsd !== undefined && budget.remainingUsd < 0.01) {
    model = getCheapest(model);
  }

  return model;
}

export const DEFAULT_ROUTES: ModelRoute[] = [
  {
    name: "Simple greetings",
    description: "Use cheap model for hi/hello/thanks",
    condition: { type: "keyword", keywords: ["hi", "hello", "hey", "thanks", "thank you", "ok", "bye"] },
    targetModel: "claude-haiku-3-20250514",
    priority: 10,
    enabled: true,
  },
  {
    name: "Short messages",
    description: "Use cheap model for messages under 50 chars",
    condition: { type: "message_length", maxLength: 50 },
    targetModel: "claude-haiku-3-20250514",
    priority: 5,
    enabled: true,
  },
  {
    name: "Code tasks",
    description: "Use powerful model for code",
    condition: { type: "has_code", codeDetection: true },
    targetModel: "claude-sonnet-4-20250514",
    priority: 20,
    enabled: true,
  },
];

export { DEFAULT_ROUTING };
