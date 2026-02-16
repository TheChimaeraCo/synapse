import { NextRequest, NextResponse } from "next/server";
import { getGatewayContext, handleGatewayError } from "@/lib/gateway-context";
import { convexClient } from "@/lib/convex";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { logAudit } from "@/lib/auditLog";

export async function POST(req: NextRequest) {
  try {
    const { gatewayId } = await getGatewayContext(req);
    const body = await req.json();

    if (body.type === "budget") {
      await convexClient.mutation(api.functions.usage.setBudget, {
        gatewayId: gatewayId as Id<"gateways">,
        period: "daily",
        limitUsd: body.dailyLimit,
        action: body.action,
      });
      await convexClient.mutation(api.functions.usage.setBudget, {
        gatewayId: gatewayId as Id<"gateways">,
        period: "monthly",
        limitUsd: body.monthlyLimit,
        action: body.action,
      });
      return NextResponse.json({ success: true });
    }

    const { id, name, model, systemPrompt, temperature, maxTokens } = body;
    await convexClient.mutation(api.functions.agents.update, {
      id: id as Id<"agents">,
      name, model, systemPrompt, temperature, maxTokens,
    });
    const ctx = await getGatewayContext(req).catch(() => null);
    logAudit(ctx?.userId, "agent.update", "agent", `Updated agent: ${name}`, id);
    return NextResponse.json({ success: true });
  } catch (err) {
    return handleGatewayError(err);
  }
}
