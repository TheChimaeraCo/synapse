import { NextRequest, NextResponse } from "next/server";
import { getGatewayContext, handleGatewayError } from "@/lib/gateway-context";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

const convex = new ConvexHttpClient(process.env.CONVEX_SELF_HOSTED_URL || "http://127.0.0.1:3220");

// Role is now per-gateway via gatewayMembers
export async function POST(req: NextRequest) {
  try {
    const { userId, gatewayId, role } = await getGatewayContext(req);

    // Only admin+ can assign roles
    if (role !== "owner" && role !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { targetUserId, role: newRole } = await req.json();

    if (!targetUserId || !newRole) {
      return NextResponse.json({ error: "targetUserId and role required" }, { status: 400 });
    }

    // Use gatewayMembers to update role
    await convex.mutation(api.functions.gatewayMembers.updateRole, {
      gatewayId: gatewayId as Id<"gateways">,
      userId: targetUserId as Id<"authUsers">,
      newRole,
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    return handleGatewayError(err);
  }
}

// GET - get current user's role in active gateway
export async function GET(req: NextRequest) {
  try {
    const { userId, gatewayId, role } = await getGatewayContext(req);
    return NextResponse.json({ userId, gatewayId, role });
  } catch (err) {
    return handleGatewayError(err);
  }
}
