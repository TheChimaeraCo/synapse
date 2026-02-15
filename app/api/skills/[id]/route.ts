import { NextRequest, NextResponse } from "next/server";
import { getGatewayContext, handleGatewayError } from "@/lib/gateway-context";
import { convexClient } from "@/lib/convex";
import { api } from "@/convex/_generated/api";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { gatewayId } = await getGatewayContext(req);
    const { id } = await params;
    const skills = await convexClient.query(api.functions.skills.list, { gatewayId });
    const skill = skills.find((s: any) => s._id === id);
    if (!skill) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ skill });
  } catch (err) {
    return handleGatewayError(err);
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await getGatewayContext(req);
    const { id } = await params;
    const body = await req.json();

    if (body.action === "install") {
      await convexClient.mutation(api.functions.skills.install, { id: id as any });
      return NextResponse.json({ success: true });
    }
    if (body.action === "uninstall") {
      await convexClient.mutation(api.functions.skills.uninstall, { id: id as any });
      return NextResponse.json({ success: true });
    }
    if (body.config !== undefined) {
      await convexClient.mutation(api.functions.skills.configure, { id: id as any, config: body.config });
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (err) {
    return handleGatewayError(err);
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await getGatewayContext(req);
    const { id } = await params;
    await convexClient.mutation(api.functions.skills.remove, { id: id as any });
    return NextResponse.json({ success: true });
  } catch (err) {
    return handleGatewayError(err);
  }
}
