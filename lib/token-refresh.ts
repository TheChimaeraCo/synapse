/**
 * Server-side OAuth token refresh utility.
 *
 * Uses pi-ai's getOAuthApiKey() to automatically refresh expired tokens.
 * This runs in API routes / server actions, NOT in the browser.
 */

import { getOAuthApiKey } from "@mariozechner/pi-ai";
import type { OAuthCredentials } from "@mariozechner/pi-ai";

export interface StoredOAuthCredentials {
  access: string;
  refresh?: string;
  expires: number;
  provider: string;
}

/**
 * Check if an OAuth token needs refresh and refresh it if possible.
 *
 * @param creds - Stored OAuth credentials
 * @returns Updated credentials with fresh access token, or null if refresh not possible
 */
export async function refreshIfExpired(
  creds: StoredOAuthCredentials,
): Promise<{ accessToken: string; updatedCreds: StoredOAuthCredentials } | null> {
  // Not expired yet - use as-is
  if (Date.now() < creds.expires) {
    return { accessToken: creds.access, updatedCreds: creds };
  }

  // No refresh token - can't refresh
  if (!creds.refresh) {
    return null;
  }

  // Use pi-ai's getOAuthApiKey which handles refresh automatically
  const oauthCreds: Record<string, OAuthCredentials> = {
    [creds.provider]: {
      access: creds.access,
      refresh: creds.refresh,
      expires: creds.expires,
    },
  };

  try {
    const result = await getOAuthApiKey(creds.provider, oauthCreds);
    if (!result) return null;

    return {
      accessToken: result.apiKey,
      updatedCreds: {
        ...creds,
        access: result.newCredentials.access,
        refresh: result.newCredentials.refresh || creds.refresh,
        expires: result.newCredentials.expires,
      },
    };
  } catch (err) {
    console.error(`OAuth token refresh failed for ${creds.provider}:`, err);
    return null;
  }
}

/**
 * Check if a token looks like an OAuth setup token.
 */
export function isSetupToken(token: string): boolean {
  return token.startsWith("sk-ant-oat");
}
