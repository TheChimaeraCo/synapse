import { NextRequest, NextResponse } from "next/server";
import { getAuthContext, GatewayError } from "@/lib/gateway-context";
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

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; userId: string }> }
) {
  try {
    const { userId: actorId } = await getAuthContext();
    const { id, userId: targetUserId } = await params;
    await requireMembership(actorId, id, "admin");

    const { role } = await req.json();
    if (!role) {
      return NextResponse.json({ error: "role required" }, { status: 400 });
    }

    await convexClient.mutation(api.functions.gatewayMembers.updateRole, {
      gatewayId: id as Id<"gateways">,
      userId: targetUserId as Id<"authUsers">,
      newRole: role,
    });

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    if (err instanceof GatewayError) return NextResponse.json({ error: err.message }, { status: err.statusCode });
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; userId: string }> }
) {
  try {
    const { userId: actorId } = await getAuthContext();
    const { id, userId: targetUserId } = await params;
    await requireMembership(actorId, id, "admin");

    await convexClient.mutation(api.functions.gatewayMembers.remove, {
      gatewayId: id as Id<"gateways">,
      userId: targetUserId as Id<"authUsers">,
    });

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    if (err instanceof GatewayError) return NextResponse.json({ error: err.message }, { status: err.statusCode });
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
