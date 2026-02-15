const MODEL_COSTS: Record<string, { inputPerMillion: number; outputPerMillion: number }> = {
  "claude-sonnet-4-20250514": { inputPerMillion: 3, outputPerMillion: 15 },
  "claude-opus-4-20250514": { inputPerMillion: 15, outputPerMillion: 75 },
  "claude-haiku-3-20250514": { inputPerMillion: 0.25, outputPerMillion: 1.25 },
};

export function calculateCost(model: string, inputTokens: number, outputTokens: number): number {
  const costs = MODEL_COSTS[model];
  if (!costs) return 0;
  return (inputTokens / 1_000_000 * costs.inputPerMillion) + (outputTokens / 1_000_000 * costs.outputPerMillion);
}
