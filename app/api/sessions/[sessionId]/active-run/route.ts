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
    const activeRun = await convex.query(api.functions.activeRuns.get, {
      sessionId: sessionId as Id<"sessions">,
    });
    return NextResponse.json(activeRun ?? null);
  } catch (err: any) {
    if (err.message?.includes("does not match") || err.message?.includes("not found")) {
      return NextResponse.json(null);
    }
    return handleGatewayError(err);
  }
}
