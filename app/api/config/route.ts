import { NextRequest, NextResponse } from "next/server";
import { getGatewayContext, handleGatewayError } from "@/lib/gateway-context";
import { getConvexClient } from "@/lib/convex";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { logAudit } from "@/lib/auditLog";

const SENSITIVE_KEYS = ["api_key", "token", "secret"];
const CONFIG_KEYS = [
  "ai_provider",
  "ai_model",
  "ai_auth_method",
  "telegram_bot_token",
  "setup_complete",
  "agent_name",
];

export async function GET(req: NextRequest) {
  try {
    const { gatewayId } = await getGatewayContext(req);
    const convex = getConvexClient();
    const result: Record<string, string> = {};

    for (const key of CONFIG_KEYS) {
      try {
        const res = await convex.query(api.functions.gatewayConfig.getWithInheritance, {
          gatewayId: gatewayId as Id<"gateways">,
          key,
        });
        const val = res?.value || null;
        const isSensitive = SENSITIVE_KEYS.some((s) => key.includes(s));
        result[key] = isSensitive ? (val ? "configured" : "") : (val || "");
      } catch {
        // Fall back to systemConfig for backward compat
        try {
          const val = await convex.query(api.functions.config.get, { key });
          const isSensitive = SENSITIVE_KEYS.some((s) => key.includes(s));
          result[key] = isSensitive ? (val ? "configured" : "") : (val || "");
        } catch {}
      }
    }

    return NextResponse.json(result);
  } catch (err) {
    return handleGatewayError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const convex = getConvexClient();
    const { key, value } = await req.json();

    if (!key || value === undefined) {
      return NextResponse.json({ error: "key and value required" }, { status: 400 });
    }

    // Try gateway-scoped set first (requires auth)
    try {
      const { gatewayId } = await getGatewayContext(req);
      await convex.mutation(api.functions.gatewayConfig.set, {
        gatewayId: gatewayId as Id<"gateways">,
        key,
        value: String(value),
      });
      const ctx = await getGatewayContext(req).catch(() => null);
      logAudit(ctx?.userId, "config.change", "config", `${key} updated`, key);
      return NextResponse.json({ success: true });
    } catch (gwErr: any) {
      // Only fall back to systemConfig during initial setup (no users exist yet)
      // Check if setup is complete - if so, require auth
      const setupComplete = await convex.query(api.functions.config.isSetupComplete);
      if (setupComplete) {
        return handleGatewayError(gwErr);
      }
      // Setup not complete - allow unauthenticated config for initial wizard
      await convex.mutation(api.functions.config.set, { key, value: String(value) });
      return NextResponse.json({ success: true });
    }
  } catch (err: any) {
    console.error("Config set error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
