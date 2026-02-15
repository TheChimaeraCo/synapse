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

export async function POST(req: NextRequest) {
  try {
    const { provider, apiKey, baseUrl, authMethod } = await req.json();

    if (!apiKey || typeof apiKey !== "string" || apiKey.trim().length < 5) {
      return NextResponse.json({ valid: false, error: "Key is too short" });
    }

    switch (provider) {
      case "anthropic":
        return NextResponse.json(await testAnthropic(apiKey, authMethod));
      case "openai":
        return NextResponse.json(await testOpenAI(apiKey, baseUrl));
      case "google":
        return NextResponse.json(await testGoogle(apiKey));
      default:
        // For other providers, just validate format
        return NextResponse.json({ valid: true, unverified: true });
    }
  } catch (err: any) {
    return NextResponse.json({ valid: false, error: err.message }, { status: 500 });
  }
}
