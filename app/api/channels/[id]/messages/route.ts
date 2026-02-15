import { NextRequest, NextResponse } from "next/server";
import { getGatewayContext, handleGatewayError } from "@/lib/gateway-context";
import { getConvexClient } from "@/lib/convex";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await getGatewayContext(req);
    const convex = getConvexClient();
    const { id } = await params;
    const url = new URL(req.url);
    const limit = parseInt(url.searchParams.get("limit") || "50");

    const messages = await convex.query(api.functions.channels.getPublicMessages, {
      channelId: id as Id<"channels">,
      limit,
    });
    return NextResponse.json(messages);
  } catch (err) {
    return handleGatewayError(err);
  }
}
