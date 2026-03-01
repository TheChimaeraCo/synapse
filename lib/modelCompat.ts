type GetModelFn = (provider: any, modelId: any) => any;

const ANTIGRAVITY_ALIASES: Record<string, string[]> = {
  "gemini-3.1-pro": ["gemini-3-pro-high", "gemini-3-pro-low", "gemini-3.1-pro-preview", "gemini-3.1-pro"],
  "gemini-3.1-pro-preview": ["gemini-3-pro-high", "gemini-3-pro-low", "gemini-3.1-pro-preview", "gemini-3.1-pro"],
  "gemini-3-pro": ["gemini-3-pro-high", "gemini-3-pro-low", "gemini-3.1-pro", "gemini-3.1-pro-preview"],
  "gemini-3-pro-high": ["gemini-3-pro-high", "gemini-3-pro-low", "gemini-3.1-pro", "gemini-3.1-pro-preview"],
  "gemini-3-pro-low": ["gemini-3-pro-low", "gemini-3-pro-high", "gemini-3.1-pro", "gemini-3.1-pro-preview"],
  "claude-sonnet-4-20250514": ["claude-sonnet-4-5-thinking", "claude-sonnet-4-5"],
  "claude-opus-4-20250514": ["claude-opus-4-6-thinking", "claude-opus-4-5-thinking"],
  "claude-haiku-3-20250514": ["claude-sonnet-4-5", "claude-sonnet-4-5-thinking"],
  "gpt-5.3-codex": ["gemini-3.1-pro", "gemini-3.1-pro-preview", "gemini-3-pro-high", "gemini-3-pro-low"],
  "gpt-5.3-codex-spark": ["gemini-3.1-pro", "gemini-3.1-pro-preview", "gemini-3-pro-high", "gemini-3-pro-low"],
  "gpt-5.2-codex": ["gemini-3.1-pro", "gemini-3.1-pro-preview", "gemini-3-pro-high", "gemini-3-pro-low"],
  "gpt-5.1-codex-max": ["gemini-3.1-pro", "gemini-3.1-pro-preview", "gemini-3-pro-high", "gemini-3-pro-low"],
  "gpt-5.1-codex-mini": ["gemini-3.1-pro", "gemini-3.1-pro-preview", "gemini-3-pro-high", "gemini-3-pro-low"],
};

function uniq(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
}

function candidateIds(provider: string, requestedModelId: string, fallbackModelId?: string): string[] {
  const candidates: string[] = [requestedModelId];
  if (provider === "google-antigravity") {
    const requestedAliases = ANTIGRAVITY_ALIASES[requestedModelId] || [];
    candidates.push(...requestedAliases);
    if (fallbackModelId) {
      candidates.push(fallbackModelId);
      const fallbackAliases = ANTIGRAVITY_ALIASES[fallbackModelId] || [];
      candidates.push(...fallbackAliases);
    }
  } else if (fallbackModelId) {
    candidates.push(fallbackModelId);
  }
  return uniq(candidates);
}

export interface ResolvedCompatModel {
  model: any | null;
  modelId: string;
  requestedModelId: string;
  usedFallback: boolean;
}

export function resolveModelCompat(params: {
  provider: string;
  requestedModelId: string;
  fallbackModelId?: string;
  getModel: GetModelFn;
}): ResolvedCompatModel {
  const provider = String(params.provider || "").trim();
  const requestedModelId = String(params.requestedModelId || "").trim();
  const fallbackModelId = params.fallbackModelId ? String(params.fallbackModelId).trim() : undefined;
  const getModel = params.getModel;

  const ids = candidateIds(provider, requestedModelId, fallbackModelId);
  for (const id of ids) {
    const model = getModel(provider as any, id as any);
    if (model) {
      return {
        model,
        modelId: id,
        requestedModelId,
        usedFallback: id !== requestedModelId,
      };
    }
  }

  return {
    model: null,
    modelId: requestedModelId || fallbackModelId || "",
    requestedModelId,
    usedFallback: true,
  };
}

export function withCompatModelId(provider: string, modelId: string): string {
  const trimmedProvider = String(provider || "").trim();
  const trimmedModel = String(modelId || "").trim();
  if (!trimmedModel) return trimmedModel;
  if (trimmedProvider !== "google-antigravity") return trimmedModel;

  const aliases = ANTIGRAVITY_ALIASES[trimmedModel];
  if (!aliases || aliases.length === 0) return trimmedModel;
  return aliases[0];
}

export function augmentProviderModelList(provider: string, modelIds: string[]): string[] {
  const base = uniq(modelIds || []);
  if (provider !== "google-antigravity") return base;
  return uniq(["gemini-3.1-pro", "gemini-3.1-pro-preview", ...base]);
}
