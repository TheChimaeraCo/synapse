import { NextRequest, NextResponse } from "next/server";
import { getAuthContext, GatewayError } from "@/lib/gateway-context";
import { convexClient } from "@/lib/convex";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

async function requireMembership(userId: string, gatewayId: string, minRole?: string) {
  const role = await convexClient.query(api.functions.gatewayMembers.getRole, {
    gatewayId: gatewayId as Id<"gateways">,
    userId: userId as Id<"authUsers">,
  });
  if (!role) throw new GatewayError(403, "No access to this gateway");
  if (minRole) {
    const levels: Record<string, number> = { owner: 4, admin: 3, member: 2, viewer: 1 };
    if ((levels[role] || 0) < (levels[minRole] || 0)) {
      throw new GatewayError(403, `Requires ${minRole} role or higher`);
    }
  }
  return role;
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { userId } = await getAuthContext();
    const { id } = await params;
    await requireMembership(userId, id);

    const members = await convexClient.query(api.functions.gatewayMembers.list, {
      gatewayId: id as Id<"gateways">,
    });
    return NextResponse.json({ members });
  } catch (err: any) {
    if (err instanceof GatewayError) return NextResponse.json({ error: err.message }, { status: err.statusCode });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { userId: actorId } = await getAuthContext();
    const { id } = await params;
    await requireMembership(actorId, id, "admin");

    const { userId, role } = await req.json();
    if (!userId || !role) {
      return NextResponse.json({ error: "userId and role required" }, { status: 400 });
    }

    // Validate member capacity
    const currentMembers = await convexClient.query(api.functions.gatewayMembers.list, {
      gatewayId: id as Id<"gateways">,
    });
    const { canAddUser, upgradeMessage } = require("@/lib/license");
    if (!canAddUser(currentMembers.length)) {
      return NextResponse.json({ error: upgradeMessage("Member limit reached.") }, { status: 403 });
    }

    const memberId = await convexClient.mutation(api.functions.gatewayMembers.add, {
      gatewayId: id as Id<"gateways">,
      userId: userId as Id<"authUsers">,
      role,
      addedBy: actorId as Id<"authUsers">,
    });

    return NextResponse.json({ memberId }, { status: 201 });
  } catch (err: any) {
    if (err instanceof GatewayError) return NextResponse.json({ error: err.message }, { status: err.statusCode });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
