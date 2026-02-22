export interface AuthField {
  key: string;
  label: string;
  type: "password" | "text" | "url" | "textarea";
  required: boolean;
  helpText?: string;
  helpUrl?: string;
}

export interface ProviderConfig {
  slug: string;
  name: string;
  description?: string;
  recommended?: boolean;
  authFields: AuthField[];
  defaultModel: string;
  models: string[];
  apiBase: string;
  helpUrl?: string;
  /** true if we can actually verify the key via API call */
  testable?: boolean;
}

export const PROVIDERS: ProviderConfig[] = [
  {
    slug: "openai",
    name: "OpenAI",
    description: "GPT-4o, o1, o3 and more",
    authFields: [
      { key: "api_key", label: "API Key", type: "password", required: true, helpText: "Starts with sk-" },
    ],
    defaultModel: "gpt-4o",
    models: ["gpt-4o", "gpt-4o-mini", "o3-mini"],
    apiBase: "https://api.openai.com/v1",
    helpUrl: "https://platform.openai.com/api-keys",
    testable: true,
  },
  {
    slug: "openai-codex",
    name: "OpenAI Codex (ChatGPT Subscription)",
    description: "Use ChatGPT Plus/Pro OAuth credentials for Codex models",
    authFields: [
      {
        key: "oauth_credentials",
        label: "OAuth Credentials JSON",
        type: "textarea",
        required: true,
        helpText: "Run: npx @mariozechner/pi-ai login openai-codex, then paste the provider credentials JSON.",
      },
    ],
    defaultModel: "gpt-5.3-codex",
    models: ["gpt-5.3-codex", "gpt-5.3-codex-spark", "gpt-5.2-codex", "gpt-5.1-codex-max", "gpt-5.1-codex-mini"],
    apiBase: "https://chatgpt.com/backend-api",
    helpUrl: "https://chatgpt.com",
    testable: true,
  },
  {
    slug: "anthropic",
    name: "Anthropic",
    description: "Claude Sonnet, Opus, Haiku",
    recommended: true,
    authFields: [
      { key: "api_key", label: "API Key", type: "password", required: true, helpText: "Starts with sk-ant-. You can also use a Setup Token from 'claude setup-token'" },
    ],
    defaultModel: "claude-sonnet-4-20250514",
    models: ["claude-sonnet-4-20250514", "claude-opus-4-20250514", "claude-haiku-3-20250514"],
    apiBase: "https://api.anthropic.com",
    helpUrl: "https://console.anthropic.com",
    testable: true,
  },
  {
    slug: "google",
    name: "Google (Gemini)",
    description: "Gemini 2.5 Pro, Flash",
    authFields: [
      { key: "api_key", label: "API Key", type: "password", required: true },
    ],
    defaultModel: "gemini-2.5-pro",
    models: ["gemini-2.5-pro", "gemini-2.5-flash", "gemini-2.0-flash"],
    apiBase: "https://generativelanguage.googleapis.com/v1beta",
    helpUrl: "https://aistudio.google.com/apikey",
    testable: true,
  },
  {
    slug: "google-gemini-cli",
    name: "Google Gemini CLI (OAuth)",
    description: "Use Google subscription via Cloud Code Assist OAuth",
    authFields: [
      {
        key: "oauth_credentials",
        label: "OAuth Credentials JSON",
        type: "textarea",
        required: true,
        helpText: "Run: npx @mariozechner/pi-ai login google-gemini-cli, then paste the provider credentials JSON.",
      },
    ],
    defaultModel: "gemini-2.5-pro",
    models: ["gemini-2.5-pro", "gemini-2.5-flash", "gemini-3-pro-preview", "gemini-3-flash-preview"],
    apiBase: "https://cloudcode-pa.googleapis.com",
    helpUrl: "https://cloud.google.com",
    testable: true,
  },
  {
    slug: "google-antigravity",
    name: "Google Antigravity (OAuth)",
    description: "Google OAuth provider for Gemini 3 and partner model flavors",
    authFields: [
      {
        key: "oauth_credentials",
        label: "OAuth Credentials JSON",
        type: "textarea",
        required: true,
        helpText: "Run: npx @mariozechner/pi-ai login google-antigravity, then paste the provider credentials JSON.",
      },
    ],
    defaultModel: "gemini-3-pro-high",
    models: ["gemini-3-pro-high", "gemini-3-pro-low", "gemini-3-flash", "claude-sonnet-4-5-thinking", "gpt-oss-120b-medium"],
    apiBase: "https://daily-cloudcode-pa.sandbox.googleapis.com",
    helpUrl: "https://cloud.google.com",
    testable: true,
  },
  {
    slug: "google-vertex",
    name: "Google Vertex AI (ADC)",
    description: "Google Cloud ADC-based auth (no API key)",
    authFields: [
      { key: "project_id", label: "Project ID", type: "text", required: true, helpText: "Google Cloud project ID" },
      { key: "location", label: "Location", type: "text", required: true, helpText: "e.g. us-central1" },
    ],
    defaultModel: "gemini-2.5-flash",
    models: ["gemini-2.5-flash", "gemini-2.5-pro", "gemini-3-pro-preview", "gemini-3-flash-preview"],
    apiBase: "https://aiplatform.googleapis.com",
    helpUrl: "https://cloud.google.com/vertex-ai/docs/authentication",
    testable: true,
  },
  {
    slug: "xai",
    name: "xAI (Grok)",
    description: "Grok-2, Grok-3",
    authFields: [
      { key: "api_key", label: "API Key", type: "password", required: true },
    ],
    defaultModel: "grok-3",
    models: ["grok-3", "grok-3-mini", "grok-2"],
    apiBase: "https://api.x.ai/v1",
    helpUrl: "https://console.x.ai",
  },
  {
    slug: "openrouter",
    name: "OpenRouter",
    description: "Access many models via one key",
    authFields: [
      { key: "api_key", label: "API Key", type: "password", required: true },
    ],
    defaultModel: "anthropic/claude-sonnet-4",
    models: ["anthropic/claude-sonnet-4", "openai/gpt-4o", "google/gemini-2.5-pro"],
    apiBase: "https://openrouter.ai/api/v1",
    helpUrl: "https://openrouter.ai/keys",
  },
  {
    slug: "minimax",
    name: "MiniMax",
    description: "MiniMax large language models",
    authFields: [
      { key: "api_key", label: "API Key", type: "password", required: true },
    ],
    defaultModel: "MiniMax-Text-01",
    models: ["MiniMax-Text-01"],
    apiBase: "https://api.minimax.chat/v1",
    helpUrl: "https://platform.minimaxi.com",
  },
  {
    slug: "moonshot",
    name: "Moonshot AI",
    description: "Kimi K2.5",
    authFields: [
      { key: "api_key", label: "API Key", type: "password", required: true },
    ],
    defaultModel: "kimi-k2.5",
    models: ["kimi-k2.5", "moonshot-v1-8k"],
    apiBase: "https://api.moonshot.cn/v1",
    helpUrl: "https://platform.moonshot.cn",
  },
  {
    slug: "qwen",
    name: "Qwen",
    description: "Qwen models from Alibaba",
    authFields: [
      { key: "api_key", label: "API Key", type: "password", required: true },
    ],
    defaultModel: "qwen-max",
    models: ["qwen-max", "qwen-plus", "qwen-turbo"],
    apiBase: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    helpUrl: "https://dashscope.console.aliyun.com",
  },
  {
    slug: "zai",
    name: "Z.AI (GLM)",
    description: "GLM 4.7 and related models",
    authFields: [
      { key: "api_key", label: "API Key", type: "password", required: true },
    ],
    defaultModel: "glm-4.7",
    models: ["glm-4.7", "glm-4-plus"],
    apiBase: "https://open.bigmodel.cn/api/paas/v4",
    helpUrl: "https://open.bigmodel.cn",
  },
  {
    slug: "qianfan",
    name: "Qianfan",
    description: "Baidu Qianfan platform",
    authFields: [
      { key: "api_key", label: "API Key", type: "password", required: true },
    ],
    defaultModel: "ernie-4.0",
    models: ["ernie-4.0", "ernie-3.5"],
    apiBase: "https://aip.baidubce.com",
    helpUrl: "https://cloud.baidu.com/product/wenxinworkshop",
  },
  {
    slug: "copilot",
    name: "Copilot",
    description: "GitHub Copilot token",
    authFields: [
      { key: "api_key", label: "Token", type: "password", required: true, helpText: "Your Copilot access token" },
    ],
    defaultModel: "gpt-4o",
    models: ["gpt-4o", "claude-sonnet-4"],
    apiBase: "https://api.githubcopilot.com",
    helpUrl: "https://github.com/settings/copilot",
  },
  {
    slug: "vercel",
    name: "Vercel AI Gateway",
    description: "Vercel's AI gateway with custom base URL",
    authFields: [
      { key: "api_key", label: "API Key", type: "password", required: true },
      { key: "base_url", label: "Base URL", type: "url", required: true, helpText: "Your Vercel AI Gateway endpoint" },
    ],
    defaultModel: "gpt-4o",
    models: ["gpt-4o"],
    apiBase: "",
  },
  {
    slug: "opencode-zen",
    name: "OpenCode Zen",
    description: "OpenCode Zen models",
    authFields: [
      { key: "api_key", label: "API Key", type: "password", required: true },
    ],
    defaultModel: "zen-1",
    models: ["zen-1"],
    apiBase: "https://api.opencode.ai/v1",
  },
  {
    slug: "xiaomi",
    name: "Xiaomi",
    description: "Xiaomi AI models",
    authFields: [
      { key: "api_key", label: "API Key", type: "password", required: true },
    ],
    defaultModel: "xiaomi-ai",
    models: ["xiaomi-ai"],
    apiBase: "https://api.xiaomi.com/v1",
  },
  {
    slug: "synthetic",
    name: "Synthetic",
    description: "Synthetic AI models",
    authFields: [
      { key: "api_key", label: "API Key", type: "password", required: true },
    ],
    defaultModel: "synthetic-1",
    models: ["synthetic-1"],
    apiBase: "https://api.synthetic.com/v1",
  },
  {
    slug: "venice",
    name: "Venice AI",
    description: "Privacy-focused AI models",
    authFields: [
      { key: "api_key", label: "API Key", type: "password", required: true },
    ],
    defaultModel: "llama-3.1-405b",
    models: ["llama-3.1-405b", "mistral-large"],
    apiBase: "https://api.venice.ai/api/v1",
    helpUrl: "https://venice.ai",
  },
  {
    slug: "cloudflare",
    name: "Cloudflare AI Gateway",
    description: "Cloudflare Workers AI with account routing",
    authFields: [
      { key: "api_key", label: "API Key", type: "password", required: true },
      { key: "account_id", label: "Account ID", type: "text", required: true, helpText: "Your Cloudflare account ID" },
    ],
    defaultModel: "@cf/meta/llama-3-8b-instruct",
    models: ["@cf/meta/llama-3-8b-instruct"],
    apiBase: "https://api.cloudflare.com/client/v4/accounts",
    helpUrl: "https://dash.cloudflare.com",
  },
];

/** Special auth method sub-options for Anthropic */
export type AnthropicAuthMethod = "api_key" | "setup_token";

export function getProvider(slug: string): ProviderConfig | undefined {
  return PROVIDERS.find((p) => p.slug === slug);
}
