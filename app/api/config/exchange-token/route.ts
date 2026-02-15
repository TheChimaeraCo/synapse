import { NextRequest, NextResponse } from "next/server";

/**
 * Exchange/validate a setup token and store OAuth credentials.
 *
 * For Anthropic setup tokens (sk-ant-oat01-*):
 * - These are already OAuth access tokens (Bearer auth)
 * - We validate them, then store as OAuth credentials
 * - pi-ai handles Bearer auth + OAuth headers automatically when it sees sk-ant-oat* keys
 */
export async function POST(req: NextRequest) {
  try {
    const { provider, token } = await req.json();

    if (!token || typeof token !== "string") {
      return NextResponse.json({ success: false, error: "Token is required" }, { status: 400 });
    }

    switch (provider) {
      case "anthropic":
        return NextResponse.json(await exchangeAnthropicToken(token));
      default:
        return NextResponse.json(
          { success: false, error: `Token exchange not supported for provider "${provider}"` },
          { status: 400 },
        );
    }
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

async function exchangeAnthropicToken(token: string): Promise<{
  success: boolean;
  accessToken?: string;
  authMethod?: string;
  expiresAt?: number;
  error?: string;
}> {
  const trimmed = token.trim();

  // Validate it looks like a setup token
  if (!trimmed.startsWith("sk-ant-oat")) {
    return { success: false, error: 'Expected an Anthropic OAuth/setup token starting with "sk-ant-oat"' };
  }
  if (trimmed.length < 80) {
    return { success: false, error: "Token looks too short; paste the full setup token" };
  }

  // Verify the token works by listing models (no chat call needed)
  try {
    const res = await fetch("https://api.anthropic.com/v1/models", {
      headers: {
        authorization: `Bearer ${trimmed}`,
        "anthropic-version": "2023-06-01",
        "anthropic-beta": "oauth-2025-04-20",
      },
    });

    if (!res.ok) {
      const text = await res.text();
      return { success: false, error: `Token validation failed: ${res.status} - ${text}` };
    }

    // Setup tokens are OAuth access tokens. pi-ai auto-detects sk-ant-oat* tokens
    // and uses Bearer auth + OAuth headers. We store the token as-is.
    // Token expiry is typically ~10 minutes for setup tokens, but we don't know exactly.
    // pi-ai's Anthropic provider will handle refresh if we have a refresh token.
    const expiresAt = Date.now() + 10 * 60 * 1000; // Conservative 10 min estimate

    return {
      success: true,
      accessToken: trimmed,
      authMethod: "setup_token",
      expiresAt,
    };
  } catch (err: any) {
    return { success: false, error: `Connection failed: ${err.message}` };
  }
}
