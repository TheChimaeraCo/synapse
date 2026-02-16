import { NextRequest, NextResponse } from "next/server";
import { getAuthContext, GatewayError } from "@/lib/gateway-context";
import { convexClient } from "@/lib/convex";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

// GET - Validate invite code (public - no auth needed for checking)
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    const { code } = await params;

    const invite = await convexClient.query(api.functions.gatewayInvites.getByCode, {
      code,
    });

    if (!invite) {
      return NextResponse.json({ valid: false, error: "Invalid or expired invite" }, { status: 404 });
    }

    // Get gateway info (don't expose sensitive data)
    const gateway = await convexClient.query(api.functions.gateways.get, {
      id: invite.gatewayId,
    });

    return NextResponse.json({
      valid: true,
      gateway: gateway ? { name: gateway.name, slug: gateway.slug, icon: (gateway as any).icon } : null,
      role: invite.role,
    });
  } catch (err: any) {
    console.error("Invite lookup error:", err);
    return NextResponse.json({ error: "Failed to validate invite" }, { status: 500 });
  }
}

// POST - Accept invite (requires auth)
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    const { userId } = await getAuthContext();
    const { code } = await params;

    const gatewayId = await convexClient.mutation(api.functions.gatewayInvites.use, {
      code,
      userId: userId as Id<"authUsers">,
    });

    return NextResponse.json({ ok: true, gatewayId });
  } catch (err: any) {
    if (err instanceof GatewayError) {
      return NextResponse.json({ error: err.message }, { status: err.statusCode });
    }
    console.error("Invite use error:", err);
    return NextResponse.json({ error: "Failed to accept invite" }, { status: 400 });
  }
}
