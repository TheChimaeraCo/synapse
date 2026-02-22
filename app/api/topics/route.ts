import { NextRequest, NextResponse } from "next/server";
import { getGatewayContext, handleGatewayError } from "@/lib/gateway-context";
import { getConvexClient } from "@/lib/convex";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

export async function GET(req: Request) {
  try {
    const { gatewayId } = await getGatewayContext(req);
    const convex = getConvexClient();
    const topics = await convex.query(api.functions.topics.list, { gatewayId });
    return NextResponse.json(topics);
  } catch (err) {
    return handleGatewayError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const { gatewayId } = await getGatewayContext(req);
    const convex = getConvexClient();
    const body = await req.json();
    const id = await convex.mutation(api.functions.topics.upsert, {
      name: body.name,
      category: body.category,
      personalWeight: body.personalWeight ?? 0.5,
      gatewayId,
      metadata: body.metadata,
    });
    return NextResponse.json({ id });
  } catch (err) {
    return handleGatewayError(err);
  }
}

export async function PUT(req: NextRequest) {
  try {
    const { gatewayId } = await getGatewayContext(req);
    const convex = getConvexClient();
    const body = await req.json();

    if (!body?.id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    await convex.mutation(api.functions.topics.updateWeights, {
      id: body.id as Id<"topics">,
      ...(typeof body.personalWeight === "number" ? { personalWeight: body.personalWeight } : {}),
      ...(typeof body.frequencyWeight === "number" ? { frequencyWeight: body.frequencyWeight } : {}),
    });

    return NextResponse.json({ success: true, gatewayId });
  } catch (err) {
    return handleGatewayError(err);
  }
}
