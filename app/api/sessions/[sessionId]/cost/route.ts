import { NextRequest, NextResponse } from "next/server";
import { getGatewayContext, handleGatewayError } from "@/lib/gateway-context";
import { convexClient } from "@/lib/convex";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

export async function GET(req: NextRequest, { params }: { params: Promise<{ sessionId: string }> }) {
  try {
    await getGatewayContext(req);
    const { sessionId } = await params;
    const messages = await convexClient.query(api.functions.messages.listBySession, {
      sessionId: sessionId as Id<"sessions">,
      limit: 10000,
    });

    let totalInput = 0;
    let totalOutput = 0;
    let totalCost = 0;

    for (const msg of messages) {
      if (msg.tokens) {
        totalInput += msg.tokens.input;
        totalOutput += msg.tokens.output;
      }
      if (msg.cost) totalCost += msg.cost;
    }

    return NextResponse.json({
      inputTokens: totalInput,
      outputTokens: totalOutput,
      totalTokens: totalInput + totalOutput,
      cost: totalCost,
    });
  } catch (err) {
    return handleGatewayError(err);
  }
}
