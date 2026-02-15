import { NextRequest, NextResponse } from "next/server";
import { getGatewayContext, handleGatewayError } from "@/lib/gateway-context";
import { getConvexClient } from "@/lib/convex";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

export async function GET(req: NextRequest) {
  try {
    const { gatewayId } = await getGatewayContext(req);
    const convex = getConvexClient();

    // Get all gateway config (includes inherited from master)
    const gatewayConfig = await convex.query(api.functions.gatewayConfig.getAll, {
      gatewayId: gatewayId as Id<"gateways">,
    });

    return NextResponse.json(gatewayConfig);
  } catch (err) {
    // Fall back to old behavior for backward compat
    try {
      const { getAuthSession, unauthorized } = await import("@/lib/api-auth");
      const session = await getAuthSession();
      if (!session) return unauthorized();
      const convex = getConvexClient();
      // Return systemConfig as fallback
      const all = await convex.query(api.functions.config.getAll);
      return NextResponse.json(all);
    } catch {
      return handleGatewayError(err);
    }
  }
}
