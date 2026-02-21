import { NextRequest, NextResponse } from "next/server";
import { getGatewayContext, GatewayError } from "@/lib/gateway-context";
import { convexClient } from "@/lib/convex";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

export async function GET(req: NextRequest) {
  try {
    const ctx = await getGatewayContext(req);
    const gatewayId = ctx.gatewayId as Id<"gateways">;
    const soul = await convexClient.query(api.functions.onboarding.getSoul, {
      gatewayId,
    });
    return NextResponse.json({ soul: soul || null });
  } catch (err) {
    const status = err instanceof GatewayError ? err.statusCode : 500;
    return NextResponse.json({ error: "Failed to get soul" }, { status });
  }
}

export async function POST(req: NextRequest) {
  try {
    const ctx = await getGatewayContext(req);
    const gatewayId = ctx.gatewayId as Id<"gateways">;
    const { soul } = await req.json();
    
    if (!soul) {
      return NextResponse.json({ error: "soul is required" }, { status: 400 });
    }

    // Get agent for this gateway
    const agents = await convexClient.query(api.functions.agents.list, { gatewayId });
    const agent = agents?.[0];
    if (!agent) {
      return NextResponse.json({ error: "No agent found" }, { status: 404 });
    }

    // Check if soul exists
    const existing = await convexClient.query(api.functions.onboarding.getSoul, {
      gatewayId,
    });

    if (existing) {
      // Update via knowledge upserts
      const fields = ["name", "personality", "purpose", "tone", "emoji"] as const;
      for (const field of fields) {
        if (soul[field]) {
          await convexClient.mutation(api.functions.knowledge.upsert, {
            agentId: agent._id,
            gatewayId,
            category: "identity",
            key: field,
            value: soul[field],
            confidence: 0.9,
            source: "settings",
          });
        }
      }
    } else {
      // Create new soul
      await convexClient.mutation(api.functions.onboarding.completeSoul, {
        gatewayId,
        userId: undefined as any,
        soul: {
          name: soul.name || "Agent",
          emoji: soul.emoji,
          personality: soul.personality || "Helpful and adaptive",
          purpose: soul.purpose || "Personal assistant",
          tone: soul.tone || "Warm and genuine",
        },
        userProfile: { displayName: "Human" },
      });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    const status = err instanceof GatewayError ? err.statusCode : 500;
    return NextResponse.json({ error: "Failed to save soul" }, { status });
  }
}
