import { NextRequest, NextResponse } from "next/server";
import { getGatewayContext, handleGatewayError } from "@/lib/gateway-context";
import { getConvexClient } from "@/lib/convex";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { logAudit } from "@/lib/auditLog";

const SENSITIVE_KEYS = ["api_key", "token", "secret", "provider_profiles", "oauth_credentials"];
const CONFIG_KEYS = [
  "ai_provider",
  "ai_model",
  "ai_auth_method",
  "ai_oauth_provider",
  "ai_oauth_credentials",
  "ai_project_id",
  "ai_location",
  "ai.provider_profiles",
  "ai.default_profile_id",
  "ai.capability_routes",
  "telegram_bot_token",
  "setup_complete",
  "agent_name",
];

export async function GET(req: NextRequest) {
  try {
    const { gatewayId } = await getGatewayContext(req);
    const convex = getConvexClient();
    const params = new URL(req.url).searchParams;
    const prefix = params.get("prefix");
    const keysParam = params.get("keys");
    const singleKey = params.get("key");

    if (prefix || keysParam || singleKey) {
      const result: Record<string, string> = {};

      if (singleKey) {
        const res = await convex.query(api.functions.gatewayConfig.getWithInheritance, {
          gatewayId: gatewayId as Id<"gateways">,
          key: singleKey,
        });
        const val = res?.value || null;
        const isSensitive = SENSITIVE_KEYS.some((s) => singleKey.includes(s));
        result[singleKey] = isSensitive ? (val ? "configured" : "") : (val || "");
      }

      if (keysParam) {
        const keys = keysParam.split(",").map((k) => k.trim()).filter(Boolean);
        if (keys.length > 0) {
          const res = await convex.query(api.functions.gatewayConfig.getMultiple, {
            gatewayId: gatewayId as Id<"gateways">,
            keys,
          });
          for (const key of keys) {
            const val = res[key] || "";
            const isSensitive = SENSITIVE_KEYS.some((s) => key.includes(s));
            result[key] = isSensitive ? (val ? "configured" : "") : val;
          }
        }
      }

      if (prefix) {
        const all = await convex.query(api.functions.gatewayConfig.getAll, {
          gatewayId: gatewayId as Id<"gateways">,
        });
        for (const [key, value] of Object.entries(all)) {
          if (!key.startsWith(prefix)) continue;
          const isSensitive = SENSITIVE_KEYS.some((s) => key.includes(s));
          result[key] = isSensitive ? (value ? "configured" : "") : value;
        }
      }

      return NextResponse.json(result);
    }

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
    try {
      const convex = getConvexClient();
      const params = new URL(req.url).searchParams;
      const prefix = params.get("prefix");
      const keysParam = params.get("keys");
      const singleKey = params.get("key");

      if (prefix || keysParam || singleKey) {
        const result: Record<string, string> = {};
        if (singleKey) {
          const val = await convex.query(api.functions.config.get, { key: singleKey });
          const isSensitive = SENSITIVE_KEYS.some((s) => singleKey.includes(s));
          result[singleKey] = isSensitive ? (val ? "configured" : "") : (val || "");
        }
        if (keysParam) {
          const keys = keysParam.split(",").map((k) => k.trim()).filter(Boolean);
          if (keys.length > 0) {
            const vals = await convex.query(api.functions.config.getMultiple, { keys });
            for (const key of keys) {
              const val = vals[key] || "";
              const isSensitive = SENSITIVE_KEYS.some((s) => key.includes(s));
              result[key] = isSensitive ? (val ? "configured" : "") : val;
            }
          }
        }
        if (prefix) {
          const vals = await convex.query(api.functions.config.getByPrefix, { prefix });
          for (const [key, value] of Object.entries(vals)) {
            const isSensitive = SENSITIVE_KEYS.some((s) => key.includes(s));
            result[key] = isSensitive ? (value ? "configured" : "") : value;
          }
        }
        return NextResponse.json(result);
      }
    } catch {}
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
