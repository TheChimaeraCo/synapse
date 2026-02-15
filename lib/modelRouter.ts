// Synapse - (c) The Chimaera Company LLC
// Licensed under the Functional Source License 1.0
/**
 * Model Router - selects optimal model based on task type and budget state.
 */

export type TaskType = "chat" | "tool_use" | "summary" | "code";

export interface ModelRoutingConfig {
  chat: string;
  tool_use: string;
  summary: string;
  code: string;
}

export interface BudgetState {
  allowed: boolean;
  suggestedModel?: string;
  remainingUsd?: number;
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
};

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

export function selectModel(
  taskType: TaskType,
  routing: ModelRoutingConfig | null,
  budget: BudgetState,
  agentModel?: string,
): string {
  const config = routing || DEFAULT_ROUTING;

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
    // Only downgrade - don't upgrade
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

export { DEFAULT_ROUTING };
