import { NextRequest, NextResponse } from "next/server";
import { getGatewayContext, handleGatewayError } from "@/lib/gateway-context";
import { convexClient } from "@/lib/convex";
import { api } from "@/convex/_generated/api";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await getGatewayContext(req);
    const { id } = await params;

    const all = await convexClient.query(api.functions.workerAgents.listAll, { limit: 50 });
    const agent = all.find((a: any) => a._id === id);
    if (!agent) return NextResponse.json({ logs: [], error: "Agent not found" });

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
