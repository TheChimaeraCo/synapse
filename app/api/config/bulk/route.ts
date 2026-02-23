import { NextRequest, NextResponse } from "next/server";
import { GatewayError, getGatewayContext, handleGatewayError } from "@/lib/gateway-context";
import { getConvexClient } from "@/lib/convex";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

function requireConfigManager(role: string) {
  if (role !== "owner" && role !== "admin") {
    throw new GatewayError(403, "Owner/admin role required");
  }
}

// GET: fetch multiple config keys by prefix or list
export async function GET(req: NextRequest) {
  try {
    const { gatewayId } = await getGatewayContext(req);
    const convex = getConvexClient();

    const prefix = new URL(req.url).searchParams.get("prefix");
    const keys = new URL(req.url).searchParams.get("keys");

    if (keys) {
      const keyList = keys.split(",");
      const result = await convex.query(api.functions.gatewayConfig.getMultiple, {
        gatewayId: gatewayId as Id<"gateways">,
        keys: keyList,
      });
      return NextResponse.json(result);
    }
    if (prefix) {
      // gatewayConfig doesn't have getByPrefix, get all and filter
      const all = await convex.query(api.functions.gatewayConfig.getAll, {
        gatewayId: gatewayId as Id<"gateways">,
      });
      const filtered: Record<string, string> = {};
      for (const [k, v] of Object.entries(all)) {
        if (k.startsWith(prefix)) filtered[k] = v;
      }
      return NextResponse.json(filtered);
    }
    return NextResponse.json({});
  } catch (err) {
    // Fall back to old behavior
    try {
      const { getAuthSession, unauthorized } = await import("@/lib/api-auth");
      const session = await getAuthSession();
      if (!session) return unauthorized();
      const convex = getConvexClient();
      const prefix = new URL(req.url).searchParams.get("prefix");
      const keys = new URL(req.url).searchParams.get("keys");
      if (keys) {
        const result = await convex.query(api.functions.config.getMultiple, { keys: keys.split(",") });
        return NextResponse.json(result);
      }
      if (prefix) {
        const result = await convex.query(api.functions.config.getByPrefix, { prefix });
        return NextResponse.json(result);
      }
      return NextResponse.json({});
    } catch {
      return handleGatewayError(err);
    }
  }
}

// POST: set multiple config keys at once
export async function POST(req: NextRequest) {
  let entries: Record<string, string> = {};
  try {
    entries = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    const { gatewayId, role } = await getGatewayContext(req);
    requireConfigManager(role);
    const convex = getConvexClient();
    for (const [key, value] of Object.entries(entries)) {
      await convex.mutation(api.functions.gatewayConfig.set, {
        gatewayId: gatewayId as Id<"gateways">,
        key,
        value: String(value),
      });
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    // Fall back to old behavior
    try {
      const { getAuthSession, unauthorized } = await import("@/lib/api-auth");
      const session = await getAuthSession();
      if (!session) return unauthorized();
      const role = session.role as string;
      if (role !== "owner" && role !== "admin") {
        return NextResponse.json({ error: "Owner/admin role required" }, { status: 403 });
      }
      const convex = getConvexClient();
      for (const [key, value] of Object.entries(entries)) {
        await convex.mutation(api.functions.config.set, { key, value: String(value) });
      }
      return NextResponse.json({ success: true });
    } catch {
      return handleGatewayError(err);
    }
  }
}
