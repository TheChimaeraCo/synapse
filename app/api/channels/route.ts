import { NextRequest, NextResponse } from "next/server";
import { getGatewayContext, handleGatewayError } from "@/lib/gateway-context";
import { getConvexClient } from "@/lib/convex";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

export async function GET(req: Request) {
  try {
    const { gatewayId } = await getGatewayContext(req);
    const convex = getConvexClient();
    const channels = await convex.query(api.functions.channels.listForGateway, {
      gatewayId: gatewayId as Id<"gateways">,
    });
    return NextResponse.json(channels);
  } catch (err) {
    return handleGatewayError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const { gatewayId } = await getGatewayContext(req);
    const convex = getConvexClient();
    const body = await req.json();

    const agents = await convex.query(api.functions.agents.list, {
      gatewayId: gatewayId as Id<"gateways">,
    });
    const agent = agents?.[0];
    if (!agent) return NextResponse.json({ error: "No agent found" }, { status: 400 });

    const id = await convex.mutation(api.functions.channels.createCustom, {
      gatewayId: gatewayId as Id<"gateways">,
      name: body.name || "New Channel",
      agentId: agent._id,
      description: body.description,
      icon: body.icon,
      isPublic: body.isPublic,
    });

    return NextResponse.json({ _id: id });
  } catch (err) {
    return handleGatewayError(err);
  }
}
