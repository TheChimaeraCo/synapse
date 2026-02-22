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

    let models: string[] = [];

    const getBuiltInModels = async (providerId: string) => {
      const { registerBuiltInApiProviders, getModels } = await import("@mariozechner/pi-ai");
      registerBuiltInApiProviders();
      const raw = getModels(providerId as any) || [];
      return raw.map((m: any) => m?.id).filter(Boolean).sort();
    };

    switch (aiProvider) {
      case "anthropic": {
        if (!apiKey) break;
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
        if (!apiKey) break;
        const base = baseUrl || "https://api.openai.com/v1";
        const res = await fetch(`${base}/models`, { headers: { Authorization: `Bearer ${apiKey}` } });
        if (res.ok) {
          const data = await res.json();
          models = (data.data || []).map((m: any) => m.id).filter((id: string) => id.startsWith("gpt-") || id.startsWith("o")).sort();
        }
        break;
      }
      case "google": {
        if (!apiKey) break;
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
        if (res.ok) {
          const data = await res.json();
          models = (data.models || []).map((m: any) => m.name?.replace("models/", "")).filter(Boolean).sort();
        }
        break;
      }
      case "openai-codex":
      case "google-gemini-cli":
      case "google-antigravity":
      case "google-vertex": {
        models = await getBuiltInModels(aiProvider);
        break;
      }
      default: {
        models = await getBuiltInModels(aiProvider);
      }
    }

    if (models.length === 0 && !apiKey && !["google-vertex", "openai-codex", "google-gemini-cli", "google-antigravity"].includes(aiProvider)) {
      return NextResponse.json({ models: [], provider: aiProvider, error: "No API key configured" });
    }

    return NextResponse.json({ models, provider: aiProvider });
  } catch (err: any) {
    return NextResponse.json({ models: [], error: err.message }, { status: 500 });
  }
}
