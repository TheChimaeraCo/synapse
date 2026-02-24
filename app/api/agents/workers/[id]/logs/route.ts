import { NextRequest, NextResponse } from "next/server";
import { getGatewayContext, handleGatewayError } from "@/lib/gateway-context";
import { convexClient } from "@/lib/convex";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { gatewayId } = await getGatewayContext(req);
    const { id } = await params;
    const agent = await convexClient.query(api.functions.workerAgents.get, {
      id: id as Id<"workerAgents">,
    });
    if (!agent || String(agent.gatewayId) !== String(gatewayId)) {
      return NextResponse.json({ logs: [], error: "Agent not found" }, { status: 404 });
    }

    return NextResponse.json({
      logs: agent.logs || [],
      status: agent.status,
      result: agent.result,
      error: agent.error,
      tokens: agent.tokens,
      cost: agent.cost,
    });
  } catch (err) {
    return handleGatewayError(err);
  }
}
