import { NextRequest, NextResponse } from "next/server";
import { getGatewayContext, GatewayError } from "@/lib/gateway-context";
import { convexClient } from "@/lib/convex";
import { api } from "@/convex/_generated/api";
import { buildContext } from "@/lib/contextBuilder";
import type { Id } from "@/convex/_generated/dataModel";

export async function GET(req: NextRequest) {
  try {
    const ctx = await getGatewayContext(req);
    
    // Get the first session for this gateway to preview context
    const sessions = await convexClient.query(api.functions.sessions.list, {
      limit: 1,
    });
    
    if (!sessions || sessions.length === 0) {
      return NextResponse.json({ systemPrompt: "No sessions available for preview." });
    }

    const agents = await convexClient.query(api.functions.agents.list, {});
    const agent = agents?.[0];
    if (!agent) {
      return NextResponse.json({ systemPrompt: "No agent configured." });
    }

    const result = await buildContext(
      sessions[0]._id as Id<"sessions">,
      agent._id as Id<"agents">,
      "Hello, this is a preview message.",
    );

    return NextResponse.json({
      systemPrompt: result.systemPrompt,
      estimatedTokens: result.estimatedTokens,
      messageCount: result.messages.length,
    });
  } catch (err) {
    const status = err instanceof GatewayError ? err.statusCode : 500;
    return NextResponse.json({ error: "Failed to generate preview" }, { status });
  }
}
