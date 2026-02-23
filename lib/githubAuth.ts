import { createHash, createSign } from "crypto";
import { convexClient } from "@/lib/convex";
import { api } from "@/convex/_generated/api";

export type GitAuthMode = "cli_oauth" | "github_app";

export interface GitAuthConfig {
  mode: GitAuthMode;
  githubHost: string;
  githubAppId?: string;
  githubAppInstallationId?: string;
  githubAppPrivateKey?: string;
}

type CachedToken = { token: string; expiresAt: number };
const tokenCache = new Map<string, CachedToken>();

function base64UrlEncode(input: Buffer | string): string {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input, "utf8");
  return buf.toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function normalizePrivateKey(raw?: string): string {
  return (raw || "").replace(/\\n/g, "\n").trim();
}

export function commandLikelyUsesGit(command: string): boolean {
  return /(^|[\s;&|])(git|gh)\b/i.test(command || "");
}

export async function getGitAuthConfig(gatewayId?: string): Promise<GitAuthConfig> {
  const keys = [
    "git.auth_mode",
    "git.github_host",
    "git.github_app_id",
    "git.github_app_installation_id",
    "git.github_app_private_key",
  ];

  let cfg: Record<string, string> = {};
  if (gatewayId) {
    try {
      cfg = await convexClient.query(api.functions.gatewayConfig.getMultiple, {
        gatewayId: gatewayId as any,
        keys,
      });
    } catch {
      // fall through to process env
    }
  }

  const modeRaw = (cfg["git.auth_mode"] || process.env.GIT_AUTH_MODE || "cli_oauth").toLowerCase();
  const mode: GitAuthMode = modeRaw === "github_app" ? "github_app" : "cli_oauth";

  const githubHost =
    (cfg["git.github_host"] || process.env.GITHUB_HOST || "github.com").trim() || "github.com";
  const githubAppId = (cfg["git.github_app_id"] || process.env.GITHUB_APP_ID || "").trim();
  const githubAppInstallationId =
    (cfg["git.github_app_installation_id"] || process.env.GITHUB_APP_INSTALLATION_ID || "").trim();
  const githubAppPrivateKey = normalizePrivateKey(
    cfg["git.github_app_private_key"] || process.env.GITHUB_APP_PRIVATE_KEY || "",
  );

  return {
    mode,
    githubHost,
    githubAppId: githubAppId || undefined,
    githubAppInstallationId: githubAppInstallationId || undefined,
    githubAppPrivateKey: githubAppPrivateKey || undefined,
  };
}

function createGitHubAppJwt(appId: string, privateKey: string): string {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const payload = { iat: now - 60, exp: now + 9 * 60, iss: appId };

  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const unsigned = `${encodedHeader}.${encodedPayload}`;

  const signer = createSign("RSA-SHA256");
  signer.update(unsigned);
  signer.end();
  const signature = signer.sign(privateKey);
  return `${unsigned}.${base64UrlEncode(signature)}`;
}

function getCacheKey(config: GitAuthConfig): string {
  const keyHash = createHash("sha256")
    .update(config.githubAppPrivateKey || "")
    .digest("hex")
    .slice(0, 16);
  return `${config.githubHost}|${config.githubAppId}|${config.githubAppInstallationId}|${keyHash}`;
}

export async function getGitHubAppInstallationToken(config: GitAuthConfig): Promise<{ token: string; expiresAt: number; host: string }> {
  if (config.mode !== "github_app") {
    throw new Error("Git auth mode is not github_app");
  }
  if (!config.githubAppId) throw new Error("Missing git.github_app_id");
  if (!config.githubAppInstallationId) throw new Error("Missing git.github_app_installation_id");
  if (!config.githubAppPrivateKey) throw new Error("Missing git.github_app_private_key");

  const host = config.githubHost || "github.com";
  const cacheKey = getCacheKey(config);
  const cached = tokenCache.get(cacheKey);
  const now = Date.now();
  if (cached && cached.expiresAt - now > 60_000) {
    return { token: cached.token, expiresAt: cached.expiresAt, host };
  }

  const jwt = createGitHubAppJwt(config.githubAppId, config.githubAppPrivateKey);
  const tokenEndpoint =
    host === "github.com"
      ? `https://api.github.com/app/installations/${config.githubAppInstallationId}/access_tokens`
      : `https://${host}/api/v3/app/installations/${config.githubAppInstallationId}/access_tokens`;

  const res = await fetch(tokenEndpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${jwt}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "synapse-github-app-auth",
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GitHub App token request failed (${res.status}): ${text.slice(0, 240)}`);
  }
  const body = await res.json() as { token?: string; expires_at?: string };
  if (!body.token || !body.expires_at) {
    throw new Error("GitHub App token response missing token/expires_at");
  }
  const expiresAt = Date.parse(body.expires_at);
  tokenCache.set(cacheKey, { token: body.token, expiresAt });
  return { token: body.token, expiresAt, host };
}

export function buildGitAuthEnv(token: string, host = "github.com"): Record<string, string> {
  const basic = Buffer.from(`x-access-token:${token}`, "utf8").toString("base64");
  return {
    GH_TOKEN: token,
    GITHUB_TOKEN: token,
    GIT_TERMINAL_PROMPT: "0",
    GIT_CONFIG_COUNT: "2",
    GIT_CONFIG_KEY_0: "credential.helper",
    GIT_CONFIG_VALUE_0: "",
    GIT_CONFIG_KEY_1: `http.https://${host}/.extraheader`,
    GIT_CONFIG_VALUE_1: `AUTHORIZATION: basic ${basic}`,
  };
}
