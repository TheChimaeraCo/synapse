import { NextResponse } from "next/server";
import { getAuthContext, GatewayError } from "@/lib/gateway-context";
import { convexClient } from "@/lib/convex";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { canCreateGateway, upgradeMessage } from "@/lib/license";

export async function GET() {
  try {
    const { userId } = await getAuthContext();

    // Get gateways via membership
    const memberships = await convexClient.query(api.functions.gatewayMembers.getForUser, {
      userId: userId as Id<"authUsers">,
    });

    if (memberships && memberships.length > 0) {
      return NextResponse.json({
        gateways: memberships.map((m: any) => ({
          ...m.gateway,
          role: m.role,
          memberSince: m.addedAt,
        })),
      });
    }

    // Fallback: try legacy getByUser
    const gateways = await convexClient.query(api.functions.gateways.getByUser, {
      userId: userId as Id<"authUsers">,
    });
    return NextResponse.json({ gateways });
  } catch (err: any) {
    if (err instanceof GatewayError) {
      return NextResponse.json({ error: err.message }, { status: err.statusCode });
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const { userId } = await getAuthContext();
    const body = await req.json();
    const { name, slug, description, icon, workspacePath } = body;

    if (!name || !slug) {
      return NextResponse.json({ error: "name and slug required" }, { status: 400 });
    }

    // Check gateway capacity for current plan
    const existingGateways = await convexClient.query(api.functions.gateways.list, {});
    if (!canCreateGateway(existingGateways.length)) {
      return NextResponse.json({
        error: upgradeMessage("Gateway limit reached."),
      }, { status: 403 });
    }

    // Create gateway
    const gatewayId = await convexClient.mutation(api.functions.gateways.create, {
      name,
      slug,
      ownerId: userId as Id<"authUsers">,
      description: description || undefined,
      icon: icon || undefined,
      workspacePath: workspacePath || undefined,
    });

    // Auto-create owner membership
    try {
      await convexClient.mutation(api.functions.gatewayMembers.add, {
        gatewayId: gatewayId as Id<"gateways">,
        userId: userId as Id<"authUsers">,
        role: "owner",
        addedBy: userId as Id<"authUsers">,
      });
    } catch (e: any) {
      // Membership might already exist if gateways.create handles it
      if (!e.message?.includes("already a member")) {
        console.warn("Failed to create owner membership:", e);
      }
    }

    return NextResponse.json({ gatewayId }, { status: 201 });
  } catch (err: any) {
    if (err instanceof GatewayError) {
      return NextResponse.json({ error: err.message }, { status: err.statusCode });
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
