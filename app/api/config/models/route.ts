import { NextRequest, NextResponse } from "next/server";
import { getGatewayContext, handleGatewayError } from "@/lib/gateway-context";
import { getConvexClient } from "@/lib/convex";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

async function getConfigValue(convex: any, gatewayId: string, key: string): Promise<string | null> {
  try {
    const result = await convex.query(api.functions.gatewayConfig.getWithInheritance, {
      gatewayId: gatewayId as Id<"gateways">,
      key,
    });
    return result?.value || null;
  } catch {
    // Fall back to systemConfig
    return await convex.query(api.functions.config.get, { key });
  }
}

export async function GET(req: NextRequest) {
  try {
    const convex = getConvexClient();
    let gatewayId: string | null = null;

    try {
      const ctx = await getGatewayContext(req);
      gatewayId = ctx.gatewayId;
    } catch {}

    const provider = req.nextUrl.searchParams.get("provider");

    // Get stored credentials (gateway-scoped if available)
    const aiProvider = provider
      || (gatewayId ? await getConfigValue(convex, gatewayId, "ai_provider") : await convex.query(api.functions.config.get, { key: "ai_provider" }))
      || "anthropic";
    const apiKey = gatewayId
      ? await getConfigValue(convex, gatewayId, "ai_api_key")
      : await convex.query(api.functions.config.get, { key: "ai_api_key" });
    const authMethod = gatewayId
      ? await getConfigValue(convex, gatewayId, "ai_auth_method")
      : await convex.query(api.functions.config.get, { key: "ai_auth_method" });
    const baseUrl = gatewayId
      ? await getConfigValue(convex, gatewayId, "ai_base_url")
      : await convex.query(api.functions.config.get, { key: "ai_base_url" });

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
