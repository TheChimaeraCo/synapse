import { NextRequest, NextResponse } from "next/server";
import { getGatewayContext, handleGatewayError } from "@/lib/gateway-context";
import { getConvexClient } from "@/lib/convex";
import { api } from "@/convex/_generated/api";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await getGatewayContext(req);
    const { id } = await params;
    const convex = getConvexClient();
    const project = await convex.query(api.functions.projects.getWithTasks, { id: id as any });
    if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(project);
  } catch (err) {
    return handleGatewayError(err);
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await getGatewayContext(req);
    const { id } = await params;
    const convex = getConvexClient();
    const body = await req.json();
    await convex.mutation(api.functions.projects.update, { id: id as any, ...body });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleGatewayError(err);
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await getGatewayContext(req);
    const { id } = await params;
    const convex = getConvexClient();
    await convex.mutation(api.functions.projects.remove, { id: id as any });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleGatewayError(err);
  }
}
