import { NextRequest, NextResponse } from "next/server";
import { GatewayError, getGatewayContext, handleGatewayError } from "@/lib/gateway-context";
import { getConvexClient } from "@/lib/convex";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

function requireModelManager(role: string) {
  if (role !== "owner" && role !== "admin") {
    throw new GatewayError(403, "Owner/admin role required");
  }
}

export async function GET(req: NextRequest) {
  try {
    const { gatewayId } = await getGatewayContext(req);
    const convex = getConvexClient();
    const routes = await convex.query(api.functions.modelRoutes.list, {
      gatewayId: gatewayId as Id<"gateways">,
    });
    return NextResponse.json(routes);
  } catch (err) {
    return handleGatewayError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const { gatewayId, role } = await getGatewayContext(req);
    requireModelManager(role);
    const convex = getConvexClient();
    const body = await req.json();
    const id = await convex.mutation(api.functions.modelRoutes.create, {
      gatewayId: gatewayId as Id<"gateways">,
      name: body.name,
      description: body.description || "",
      condition: body.condition,
      targetModel: body.targetModel,
      targetProvider: body.targetProvider || undefined,
      targetProviderProfileId: body.targetProviderProfileId || undefined,
      priority: body.priority ?? 10,
      enabled: body.enabled ?? true,
    });
    return NextResponse.json({ id });
  } catch (err) {
    return handleGatewayError(err);
  }
}

export async function PUT(req: NextRequest) {
  try {
    const { role } = await getGatewayContext(req);
    requireModelManager(role);
    const convex = getConvexClient();
    const body = await req.json();
    await convex.mutation(api.functions.modelRoutes.update, {
      id: body.id as Id<"modelRoutes">,
      name: body.name,
      description: body.description,
      condition: body.condition,
      targetModel: body.targetModel,
      targetProvider: body.targetProvider,
      targetProviderProfileId: body.targetProviderProfileId,
      priority: body.priority,
      enabled: body.enabled,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleGatewayError(err);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { role } = await getGatewayContext(req);
    requireModelManager(role);
    const convex = getConvexClient();
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
    await convex.mutation(api.functions.modelRoutes.remove, {
      id: id as Id<"modelRoutes">,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleGatewayError(err);
  }
}
