import { NextRequest, NextResponse } from "next/server";

async function testAnthropic(apiKey: string, authMethod?: string): Promise<{ valid: boolean; error?: string; models?: string[] }> {
  try {
    const isSetupToken = authMethod === "setup_token" || apiKey.startsWith("sk-ant-oat");

    const headers: Record<string, string> = {
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    };

    // Setup tokens (OAuth) use Bearer auth; regular API keys use x-api-key
    if (isSetupToken) {
      headers["authorization"] = `Bearer ${apiKey}`;
      headers["anthropic-beta"] = "oauth-2025-04-20";
    } else {
      headers["x-api-key"] = apiKey;
    }

    // Use /v1/models to validate credentials (doesn't require a specific model)
    const res = await fetch("https://api.anthropic.com/v1/models", {
      headers,
    });

    if (!res.ok) {
      const text = await res.text();
      if (isSetupToken && (res.status === 401 || res.status === 403)) {
        return {
          valid: false,
          error: "Setup token is invalid or expired. Run 'claude setup-token' again to get a fresh one.",
        };
      }
      return { valid: false, error: `API error ${res.status}: ${text}` };
    }
    
    // Parse available models
    const data = await res.json();
    const models = (data.data || []).map((m: any) => m.id).filter(Boolean);
    return { valid: true, models };
  } catch (err: any) {
    return { valid: false, error: err.message || "Connection failed" };
  }
}

async function testOpenAI(apiKey: string, baseUrl?: string): Promise<{ valid: boolean; error?: string }> {
  try {
    const base = baseUrl || "https://api.openai.com/v1";
    const res = await fetch(`${base}/models`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) {
      return { valid: false, error: `API error ${res.status}` };
    }
    return { valid: true };
  } catch (err: any) {
    return { valid: false, error: err.message || "Connection failed" };
  }
}

async function testGoogle(apiKey: string): Promise<{ valid: boolean; error?: string }> {
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`
    );
    if (!res.ok) {
      return { valid: false, error: `API error ${res.status}` };
    }
    return { valid: true };
  } catch (err: any) {
    return { valid: false, error: err.message || "Connection failed" };
  }
}

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function parseOAuthCredentials(raw: string, oauthProvider: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    const asObject = parsed as Record<string, unknown>;

    const nested = asObject[oauthProvider];
    if (nested && typeof nested === "object" && !Array.isArray(nested)) {
      const out = { ...(nested as Record<string, unknown>) };
      if (out.type === "oauth") delete out.type;
      return out;
    }

    if (asObject.access && asObject.refresh && asObject.expires) {
      const out = { ...asObject };
      if (out.type === "oauth") delete out.type;
      return out;
    }
  } catch {}
  return null;
}

async function testOAuthProvider(
  oauthProvider: string,
  oauthCredentials: string,
): Promise<{ valid: boolean; error?: string; unverified?: boolean }> {
  const credentials = parseOAuthCredentials(oauthCredentials, oauthProvider);
  if (!credentials) {
    return { valid: false, error: "Invalid OAuth credentials JSON" };
  }

  try {
    const { getOAuthApiKey } = await import("@mariozechner/pi-ai");
    const result = await getOAuthApiKey(oauthProvider as any, {
      [oauthProvider]: credentials as any,
    });
    if (!result?.apiKey) {
      return { valid: false, error: "OAuth credentials could not produce an access token" };
    }

    return { valid: true, unverified: true };
  } catch (err: any) {
    return { valid: false, error: err.message || "OAuth validation failed" };
  }
}

export async function POST(req: NextRequest) {
  try {
    const {
      provider,
      apiKey,
      baseUrl,
      authMethod,
      oauthProvider,
      oauthCredentials,
      projectId,
      location,
    } = await req.json();

    const key = clean(apiKey);
    const method = clean(authMethod);
    const oauthId = clean(oauthProvider);
    const oauthRaw = clean(oauthCredentials);
    const project = clean(projectId);
    const region = clean(location);

    switch (provider) {
      case "anthropic":
        if (!key || key.length < 5) return NextResponse.json({ valid: false, error: "Key is too short" });
        return NextResponse.json(await testAnthropic(key, method));
      case "openai":
        if (!key || key.length < 5) return NextResponse.json({ valid: false, error: "Key is too short" });
        return NextResponse.json(await testOpenAI(key, baseUrl));
      case "google":
        if (!key || key.length < 5) return NextResponse.json({ valid: false, error: "Key is too short" });
        return NextResponse.json(await testGoogle(key));
      case "openai-codex":
      case "google-gemini-cli":
      case "google-antigravity": {
        if (!oauthRaw) return NextResponse.json({ valid: false, error: "OAuth credentials are required" });
        const providerId = oauthId || provider;
        return NextResponse.json(await testOAuthProvider(providerId, oauthRaw));
      }
      case "google-vertex": {
        if (!project || !region) {
          return NextResponse.json({ valid: false, error: "Project ID and location are required for Vertex AI" });
        }
        process.env.GOOGLE_CLOUD_PROJECT = project;
        process.env.GCLOUD_PROJECT = project;
        process.env.GOOGLE_CLOUD_LOCATION = region;
        try {
          const { getEnvApiKey } = await import("@mariozechner/pi-ai");
          const status = clean(getEnvApiKey("google-vertex" as any));
          if (status) return NextResponse.json({ valid: true });
          return NextResponse.json({
            valid: false,
            error: "ADC not detected. Run 'gcloud auth application-default login' on the host.",
          });
        } catch (err: any) {
          return NextResponse.json({ valid: false, error: err.message || "Vertex validation failed" });
        }
      }
      default:
        // For other providers, just validate format
        return NextResponse.json({ valid: true, unverified: true });
    }
  } catch (err: any) {
    return NextResponse.json({ valid: false, error: err.message }, { status: 500 });
  }
}
