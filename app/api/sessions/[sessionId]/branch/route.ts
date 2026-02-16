import { NextResponse } from "next/server";
import { getGatewayContext, handleGatewayError } from "@/lib/gateway-context";
import { getConvexClient } from "@/lib/convex";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    await getGatewayContext(req);
    const { sessionId } = await params;
    const { messageId } = await req.json();
    if (!messageId) {
      return NextResponse.json({ error: "messageId required" }, { status: 400 });
    }

    const convex = getConvexClient();
    const newSessionId = await convex.mutation(api.functions.sessions.branch, {
      sessionId: sessionId as Id<"sessions">,
      messageId: messageId as Id<"messages">,
    });

    return NextResponse.json({ sessionId: newSessionId });
  } catch (err: any) {
    console.error("Branch error:", err);
    return handleGatewayError(err);
  }
}
