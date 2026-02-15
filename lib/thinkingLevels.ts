export type ThinkingLevel = "off" | "low" | "medium" | "high";

const THINKING_BUDGETS: Record<ThinkingLevel, number> = {
  off: 0,
  low: 2048,
  medium: 8192,
  high: 32768,
};

export function getThinkingParams(level: ThinkingLevel, provider: string): Record<string, any> {
  if (level === "off") return {};

  const budget = THINKING_BUDGETS[level];

  if (provider === "anthropic") {
    return {
      thinking: {
        type: "enabled",
        budget_tokens: budget,
      },
    };
  }

  if (provider === "openai") {
    // OpenAI reasoning effort mapping
    const effortMap: Record<ThinkingLevel, string> = {
      off: "none",
      low: "low",
      medium: "medium",
      high: "high",
    };
    return { reasoning_effort: effortMap[level] };
  }

  if (provider === "google") {
    return { thinking_budget: budget };
  }

  return {};
}

export function isValidThinkingLevel(level: string): level is ThinkingLevel {
  return ["off", "low", "medium", "high"].includes(level);
}
