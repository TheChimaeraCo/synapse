import { NextRequest, NextResponse } from "next/server";
import { getGatewayContext, handleGatewayError } from "@/lib/gateway-context";
import { getConvexClient } from "@/lib/convex";
import { api } from "@/convex/_generated/api";

export async function GET(req: NextRequest) {
  try {
    const { gatewayId } = await getGatewayContext(req);
    const convex = getConvexClient();
    const status = req.nextUrl.searchParams.get("status") || undefined;
    const projects = await convex.query(api.functions.projects.list, { gatewayId, status });
    return NextResponse.json(projects);
  } catch (err) {
    return handleGatewayError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const { gatewayId } = await getGatewayContext(req);
    const convex = getConvexClient();
    const body = await req.json();
    const id = await convex.mutation(api.functions.projects.create, {
      name: body.name,
      description: body.description || "",
      status: body.status || "active",
      priority: body.priority ?? 3,
      gatewayId,
    });
    return NextResponse.json({ id });
  } catch (err) {
    return handleGatewayError(err);
  }
}
