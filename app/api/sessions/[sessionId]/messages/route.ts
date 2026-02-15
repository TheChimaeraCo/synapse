import { NextRequest, NextResponse } from "next/server";
import { getGatewayContext, handleGatewayError } from "@/lib/gateway-context";
import { getConvexClient } from "@/lib/convex";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    await getGatewayContext(req);
    const { sessionId } = await params;
    const convex = getConvexClient();
    const url = new URL(req.url);
    const limit = parseInt(url.searchParams.get("limit") || "100");

    const messages = await convex.query(api.functions.messages.getRecent, {
      sessionId: sessionId as Id<"sessions">,
      limit,
    });

    return NextResponse.json({ messages });
  } catch (err: any) {
    if (err.message?.includes("does not match") || err.message?.includes("not found")) {
      return NextResponse.json({ messages: [], error: "invalid_session" });
    }
    return handleGatewayError(err);
  }
}
