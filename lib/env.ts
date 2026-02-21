// Environment variable validation
// Warns on missing vars but never crashes the app

interface EnvVar {
  name: string;
  required: boolean;
  description: string;
}

const ENV_VARS: EnvVar[] = [
  { name: "AUTH_SECRET", required: true, description: "NextAuth secret key" },
  { name: "ENCRYPTION_SECRET", required: false, description: "Optional override key for config secret encryption at rest (falls back to AUTH_SECRET)" },
  { name: "AUTH_URL", required: true, description: "NextAuth base URL" },
  { name: "NEXT_PUBLIC_CONVEX_URL", required: true, description: "Convex deployment URL" },
  { name: "CONVEX_SELF_HOSTED_URL", required: false, description: "Convex self-hosted API URL" },
  { name: "BRAVE_SEARCH_API_KEY", required: false, description: "Brave Search API key (for web search)" },
  { name: "NEXT_PUBLIC_VAPID_PUBLIC_KEY", required: false, description: "VAPID public key (for push notifications)" },
  { name: "VAPID_PRIVATE_KEY", required: false, description: "VAPID private key (for push notifications)" },
];

export function validateEnv(): void {
  const missing: string[] = [];
  const warnings: string[] = [];

  for (const v of ENV_VARS) {
    if (!process.env[v.name]) {
      if (v.required) {
        missing.push(`  - ${v.name}: ${v.description}`);
      } else {
        warnings.push(`  - ${v.name}: ${v.description}`);
      }
    }
  }

  if (missing.length > 0) {
    console.warn(
      `\n[env] Missing required environment variables:\n${missing.join("\n")}\n`
    );
  }

  if (warnings.length > 0) {
    console.warn(
      `[env] Optional environment variables not set:\n${warnings.join("\n")}\n`
    );
  }

  if (missing.length === 0) {
    console.log("[env] All required environment variables are set");
  }
}
