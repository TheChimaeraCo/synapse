import { NextRequest, NextResponse } from "next/server";
import { getGatewayContext, handleGatewayError } from "@/lib/gateway-context";
import { convexClient } from "@/lib/convex";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

export async function GET(req: NextRequest) {
  try {
    await getGatewayContext(req);
    const agentId = req.nextUrl.searchParams.get("agentId");
    if (!agentId) {
      return NextResponse.json({ error: "agentId required" }, { status: 400 });
    }
    const knowledge = await convexClient.query(api.functions.knowledge.list, {
      agentId: agentId as Id<"agents">,
    });
    return NextResponse.json({ knowledge });
  } catch (err) {
    return handleGatewayError(err);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    await getGatewayContext(req);
    const { id } = await req.json();
    await convexClient.mutation(api.functions.knowledge.remove, { id: id as Id<"knowledge"> });
    return NextResponse.json({ success: true });
  } catch (err) {
    return handleGatewayError(err);
  }
}

export async function PUT(req: NextRequest) {
  try {
    await getGatewayContext(req);
    const { id, value, category, confidence } = await req.json();
    await convexClient.mutation(api.functions.knowledge.update, {
      id: id as Id<"knowledge">,
      value, category, confidence,
    });
    return NextResponse.json({ success: true });
  } catch (err) {
    return handleGatewayError(err);
  }
}
