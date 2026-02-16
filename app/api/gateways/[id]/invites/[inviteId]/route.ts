import { NextRequest, NextResponse } from "next/server";
import { getAuthContext, handleGatewayError } from "@/lib/gateway-context";
import { convexClient } from "@/lib/convex";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; inviteId: string }> }
) {
  try {
    const { userId } = await getAuthContext();
    const { id, inviteId } = await params;

    // Check admin access
    const role = await convexClient.query(api.functions.gatewayMembers.getRole, {
      gatewayId: id as Id<"gateways">,
      userId: userId as Id<"authUsers">,
    });
    if (!role || (role !== "owner" && role !== "admin")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    await convexClient.mutation(api.functions.gatewayInvites.revoke, {
      inviteId: inviteId as Id<"gatewayInvites">,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleGatewayError(err);
  }
}
