export const PROVIDER_ENV_MAP: Record<string, string> = {
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
  google: "GEMINI_API_KEY",
  xai: "XAI_API_KEY",
  openrouter: "OPENROUTER_API_KEY",
  minimax: "MINIMAX_API_KEY",
  moonshot: "MOONSHOT_API_KEY",
  groq: "GROQ_API_KEY",
  qwen: "QWEN_PORTAL_API_KEY",
  zai: "ZAI_API_KEY",
  qianfan: "QIANFAN_API_KEY",
  opencode: "OPENCODE_API_KEY",
  xiaomi: "XIAOMI_API_KEY",
  synthetic: "SYNTHETIC_API_KEY",
  venice: "VENICE_API_KEY",
  "vercel-ai-gateway": "AI_GATEWAY_API_KEY",
  "cloudflare-ai-gateway": "CLOUDFLARE_AI_GATEWAY_API_KEY",
  "github-copilot": "COPILOT_GITHUB_TOKEN",
};

export function getProviderApiKey(provider: string): string | null {
  const envVar = PROVIDER_ENV_MAP[provider];
  if (!envVar) {
    return null;
  }
  return process.env[envVar] || null;
}

export function hydrateProviderEnv(provider: string, apiKey: string): void {
  const envVar = PROVIDER_ENV_MAP[provider];
  if (envVar) {
    process.env[envVar] = apiKey;
  }
}
