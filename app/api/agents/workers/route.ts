import { NextRequest, NextResponse } from "next/server";
import { getGatewayContext, handleGatewayError } from "@/lib/gateway-context";
import { convexClient } from "@/lib/convex";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

export async function GET(req: NextRequest) {
  try {
    const { gatewayId } = await getGatewayContext(req);
    const sessionId = req.nextUrl.searchParams.get("sessionId");

    if (sessionId) {
      const agents = await convexClient.query(api.functions.workerAgents.getBySession, {
        parentSessionId: sessionId as Id<"sessions">,
      });
      return NextResponse.json({ agents });
    }

    const agents = await convexClient.query(api.functions.workerAgents.getActive, {
      gatewayId: gatewayId as Id<"gateways">,
    });
    return NextResponse.json({ agents });
  } catch (err) {
    return handleGatewayError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const { gatewayId } = await getGatewayContext(req);
    const body = await req.json();
    const id = await convexClient.mutation(api.functions.workerAgents.create, {
      parentSessionId: body.parentSessionId as Id<"sessions">,
      gatewayId: gatewayId as Id<"gateways">,
      label: body.label,
      model: body.model,
      context: body.context,
    });
    return NextResponse.json({ id });
  } catch (err) {
    return handleGatewayError(err);
  }
}
