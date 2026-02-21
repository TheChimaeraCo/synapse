import { NextRequest, NextResponse } from "next/server";
import { getGatewayContext, handleGatewayError } from "@/lib/gateway-context";
import { getConvexClient } from "@/lib/convex";
import { api } from "@/convex/_generated/api";

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
