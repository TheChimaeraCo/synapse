import { NextResponse } from "next/server";
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

    const gateway = await convexClient.query(api.functions.gateways.get, {
      id: id as Id<"gateways">,
    });
    if (!gateway) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ gateway });
  } catch (err: any) {
    if (err instanceof GatewayError) {
      return NextResponse.json({ error: err.message }, { status: err.statusCode });
    }
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { userId } = await getAuthContext();
    const { id } = await params;

    await requireMembership(userId, id, "admin");

    const body = await req.json();
    await convexClient.mutation(api.functions.gateways.update, {
      id: id as Id<"gateways">,
      ...body,
    });
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    if (err instanceof GatewayError) {
      return NextResponse.json({ error: err.message }, { status: err.statusCode });
    }
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { userId } = await getAuthContext();
    const { id } = await params;

    await requireMembership(userId, id, "owner");

    await convexClient.mutation(api.functions.gateways.remove, {
      id: id as Id<"gateways">,
    });
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    if (err instanceof GatewayError) {
      return NextResponse.json({ error: err.message }, { status: err.statusCode });
    }
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
