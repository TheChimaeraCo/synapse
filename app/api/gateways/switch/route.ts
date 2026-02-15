import { NextResponse } from "next/server";
import { getAuthContext, GatewayError } from "@/lib/gateway-context";
import { convexClient } from "@/lib/convex";
import { api } from "@/convex/_generated/api";
import { cookies } from "next/headers";
import type { Id } from "@/convex/_generated/dataModel";

export async function POST(req: Request) {
  try {
    const { userId } = await getAuthContext();
    const { gatewayId } = await req.json();

    if (!gatewayId) {
      return NextResponse.json({ error: "gatewayId required" }, { status: 400 });
    }

    // Verify user has access to this gateway
    const role = await convexClient.query(api.functions.gatewayMembers.getRole, {
      gatewayId: gatewayId as Id<"gateways">,
      userId: userId as Id<"authUsers">,
    });

    if (!role) {
      // Fallback: check legacy access
      const gateway = await convexClient.query(api.functions.gateways.get, {
        id: gatewayId as Id<"gateways">,
      });
      if (!gateway) {
        return NextResponse.json({ error: "Gateway not found" }, { status: 404 });
      }
    }

    // Set both cookie names for compatibility
    const cookieStore = await cookies();
    const cookieOpts = {
      path: "/",
      httpOnly: false,
      sameSite: "lax" as const,
      maxAge: 60 * 60 * 24 * 365,
    };

    cookieStore.set("synapse-active-gateway", gatewayId, cookieOpts);
    cookieStore.set("synapse-gateway", gatewayId, cookieOpts);

    return NextResponse.json({ ok: true, gatewayId });
  } catch (err: any) {
    if (err instanceof GatewayError) {
      return NextResponse.json({ error: err.message }, { status: err.statusCode });
    }
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
