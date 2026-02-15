import { NextRequest, NextResponse } from "next/server";
import { getGatewayContext, handleGatewayError } from "@/lib/gateway-context";
import { getConvexClient } from "@/lib/convex";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

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
  // Config set - used by setup wizard (may not have auth yet for initial setup)
  try {
    const convex = getConvexClient();
    const { key, value } = await req.json();

    // Try gateway-scoped set first
    try {
      const { gatewayId } = await getGatewayContext(req);
      await convex.mutation(api.functions.gatewayConfig.set, {
        gatewayId: gatewayId as Id<"gateways">,
        key,
        value,
      });
      return NextResponse.json({ success: true });
    } catch {
      // Fall back to systemConfig (setup wizard, no auth yet)
      await convex.mutation(api.functions.config.set, { key, value });
      return NextResponse.json({ success: true });
    }
  } catch (err: any) {
    console.error("Config set error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
