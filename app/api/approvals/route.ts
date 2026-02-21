import { NextRequest, NextResponse } from "next/server";
import { getGatewayContext, GatewayError, handleGatewayError } from "@/lib/gateway-context";
import { getConvexClient } from "@/lib/convex";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

function requireApprovalManager(role: string) {
  if (role !== "owner" && role !== "admin") {
    throw new GatewayError(403, "Owner/admin role required");
  }
}

export async function GET(req: NextRequest) {
  try {
    const { gatewayId, role } = await getGatewayContext(req);
    requireApprovalManager(role);

    const convex = getConvexClient();
    const sessionId = new URL(req.url).searchParams.get("sessionId");

    let approvals: any[] = [];
    if (sessionId) {
      const session = await convex.query(api.functions.sessions.get, {
        id: sessionId as Id<"sessions">,
      });
      if (!session || String(session.gatewayId) !== gatewayId) {
        throw new GatewayError(403, "Session does not belong to this gateway");
      }
      approvals = await convex.query(api.functions.approvals.getPending, {
        sessionId: sessionId as Id<"sessions">,
      });
    } else {
      approvals = await convex.query(api.functions.approvals.getPendingForGateway, {
        gatewayId: gatewayId as Id<"gateways">,
      });
    }

    approvals.sort((a, b) => b.requestedAt - a.requestedAt);
    return NextResponse.json({ approvals });
  } catch (err) {
    return handleGatewayError(err);
  }
}
