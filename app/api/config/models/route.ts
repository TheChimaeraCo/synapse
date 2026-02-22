import { NextRequest, NextResponse } from "next/server";
import { getGatewayContext } from "@/lib/gateway-context";
import { resolveAiSelection } from "@/lib/aiRouting";

export async function GET(req: NextRequest) {
  try {
    let gatewayId: string | null = null;

    try {
      const ctx = await getGatewayContext(req);
      gatewayId = ctx.gatewayId;
    } catch {}

    const provider = req.nextUrl.searchParams.get("provider");
    const profileId = req.nextUrl.searchParams.get("profileId");

    const selection = await resolveAiSelection({
      gatewayId,
      capability: "chat",
      routeOverride: {
        provider: provider || undefined,
        providerProfileId: profileId || undefined,
      },
    });

    const aiProvider = provider || selection.provider;
    const apiKey = selection.apiKey;
    const authMethod = selection.authMethod;
    const baseUrl = selection.baseUrl;

    if (!apiKey) {
      return NextResponse.json({ models: [], error: "No API key configured" });
    }

    let models: string[] = [];

    switch (aiProvider) {
      case "anthropic": {
        const isOAuth = authMethod === "setup_token" || apiKey.startsWith("sk-ant-oat");
        const headers: Record<string, string> = { "anthropic-version": "2023-06-01" };
        if (isOAuth) {
          headers["authorization"] = `Bearer ${apiKey}`;
          headers["anthropic-beta"] = "oauth-2025-04-20";
        } else {
          headers["x-api-key"] = apiKey;
        }
        const res = await fetch("https://api.anthropic.com/v1/models", { headers });
        if (res.ok) {
          const data = await res.json();
          models = (data.data || []).map((m: any) => m.id).sort();
        }
        break;
      }
      case "openai": {
        const base = baseUrl || "https://api.openai.com/v1";
        const res = await fetch(`${base}/models`, { headers: { Authorization: `Bearer ${apiKey}` } });
        if (res.ok) {
          const data = await res.json();
          models = (data.data || []).map((m: any) => m.id).filter((id: string) => id.startsWith("gpt-") || id.startsWith("o")).sort();
        }
        break;
      }
      case "google": {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
        if (res.ok) {
          const data = await res.json();
          models = (data.models || []).map((m: any) => m.name?.replace("models/", "")).filter(Boolean).sort();
        }
        break;
      }
    }

    return NextResponse.json({ models, provider: aiProvider });
  } catch (err: any) {
    return NextResponse.json({ models: [], error: err.message }, { status: 500 });
  }
}
