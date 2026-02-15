import { NextRequest, NextResponse } from "next/server";
import { getGatewayContext, handleGatewayError } from "@/lib/gateway-context";
import { convexClient } from "@/lib/convex";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await getGatewayContext(req);
    const { id } = await params;
    const body = await req.json();
    await convexClient.mutation(api.functions.scheduler.update, {
      id: id as Id<"scheduledTasks">,
      ...body,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleGatewayError(err);
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await getGatewayContext(req);
    const { id } = await params;
    await convexClient.mutation(api.functions.scheduler.cancel, {
      id: id as Id<"scheduledTasks">,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleGatewayError(err);
  }
}
