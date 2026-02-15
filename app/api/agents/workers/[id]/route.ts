import { NextRequest, NextResponse } from "next/server";
import { getGatewayContext, handleGatewayError } from "@/lib/gateway-context";
import { convexClient } from "@/lib/convex";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await getGatewayContext(req);
    return NextResponse.json({ error: "Use session-based queries" }, { status: 400 });
  } catch (err) {
    return handleGatewayError(err);
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await getGatewayContext(req);
    const { id } = await params;
    const body = await req.json();

    if (body.complete) {
      await convexClient.mutation(api.functions.workerAgents.complete, {
        id: id as Id<"workerAgents">,
        status: body.status || "completed",
        tokens: body.tokens,
        cost: body.cost,
        result: body.result,
        error: body.error,
      });
    } else {
      await convexClient.mutation(api.functions.workerAgents.update, {
        id: id as Id<"workerAgents">,
        status: body.status,
        tokens: body.tokens,
        cost: body.cost,
        result: body.result,
        context: body.context,
        error: body.error,
      });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleGatewayError(err);
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await getGatewayContext(req);
    const { id } = await params;
    await convexClient.mutation(api.functions.workerAgents.complete, {
      id: id as Id<"workerAgents">,
      status: "failed",
      error: "Cancelled",
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleGatewayError(err);
  }
}
