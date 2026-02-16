import { NextResponse } from "next/server";
import { getGatewayContext, handleGatewayError } from "@/lib/gateway-context";
import { getConvexClient } from "@/lib/convex";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    await getGatewayContext(req);
    const { sessionId } = await params;
    const convex = getConvexClient();
    const details = await convex.query(api.functions.dashboard.getSessionDetails, {
      sessionId: sessionId as Id<"sessions">,
    });
    if (!details) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }
    return NextResponse.json(details);
  } catch (err: any) {
    console.error("Session details error:", err);
    return handleGatewayError(err);
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    await getGatewayContext(req);
    const { sessionId } = await params;
    const convex = getConvexClient();
    const body = await req.json();

    if (body.title !== undefined) {
      await convex.mutation(api.functions.sessions.rename, {
        id: sessionId as Id<"sessions">,
        title: body.title,
      });
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("Session update error:", err);
    return handleGatewayError(err);
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    await getGatewayContext(req);
    const { sessionId } = await params;
    const convex = getConvexClient();

    await convex.mutation(api.functions.sessions.deleteSession, {
      id: sessionId as Id<"sessions">,
    });

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("Session delete error:", err);
    return handleGatewayError(err);
  }
}
