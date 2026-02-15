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
    const channel = await convex.query(api.functions.channels.get, { id: id as Id<"channels"> });
    if (!channel) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(channel);
  } catch (err) {
    return handleGatewayError(err);
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await getGatewayContext(req);
    const convex = getConvexClient();
    const { id } = await params;
    const body = await req.json();
    await convex.mutation(api.functions.channels.updateChannel, { id: id as Id<"channels">, ...body });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleGatewayError(err);
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await getGatewayContext(req);
    const convex = getConvexClient();
    const { id } = await params;
    await convex.mutation(api.functions.channels.deleteCustom, { id: id as Id<"channels"> });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleGatewayError(err);
  }
}
