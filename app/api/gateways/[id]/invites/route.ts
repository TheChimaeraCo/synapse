import { NextRequest, NextResponse } from "next/server";
import { getAuthContext, handleGatewayError, GatewayError } from "@/lib/gateway-context";
import { convexClient } from "@/lib/convex";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

async function requireMembership(userId: string, gatewayId: string, minRole: string) {
  const role = await convexClient.query(api.functions.gatewayMembers.getRole, {
    gatewayId: gatewayId as Id<"gateways">,
    userId: userId as Id<"authUsers">,
  });
  if (!role) throw new GatewayError(403, "No access to this gateway");
  const levels: Record<string, number> = { owner: 4, admin: 3, member: 2, viewer: 1 };
  if ((levels[role] || 0) < (levels[minRole] || 0)) {
    throw new GatewayError(403, `Requires ${minRole} role or higher`);
  }
  return role;
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { userId } = await getAuthContext();
    const { id } = await params;
    await requireMembership(userId, id, "admin");

    const invites = await convexClient.query(api.functions.gatewayInvites.list, {
      gatewayId: id as Id<"gateways">,
    });
    return NextResponse.json({ invites });
  } catch (err) {
    return handleGatewayError, GatewayError(err);
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { userId } = await getAuthContext();
    const { id } = await params;
    await requireMembership(userId, id, "admin");

    const body = await req.json();
    const inviteId = await convexClient.mutation(api.functions.gatewayInvites.create, {
      gatewayId: id as Id<"gateways">,
      role: body.role || "member",
      maxUses: body.maxUses,
      expiresAt: body.expiresAt,
      createdBy: userId as Id<"authUsers">,
    });

    return NextResponse.json({ inviteId }, { status: 201 });
  } catch (err) {
    return handleGatewayError, GatewayError(err);
  }
}
