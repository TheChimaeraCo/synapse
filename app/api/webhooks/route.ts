import { NextRequest, NextResponse } from "next/server";
import { getGatewayContext, handleGatewayError } from "@/lib/gateway-context";
import { convexClient } from "@/lib/convex";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

export async function GET(req: NextRequest) {
  try {
    const { gatewayId } = await getGatewayContext(req);
    const webhooks = await convexClient.query(api.functions.webhooks.list, { gatewayId: gatewayId as Id<"gateways"> });
    return NextResponse.json(webhooks);
  } catch (err) { return handleGatewayError(err); }
}

export async function POST(req: NextRequest) {
  try {
    await getGatewayContext(req);
    const body = await req.json();
    const id = await convexClient.mutation(api.functions.webhooks.create, {
      gatewayId: body.gatewayId as Id<"gateways">,
      url: body.url,
      events: body.events,
      secret: body.secret,
      enabled: body.enabled,
      description: body.description,
    });
    return NextResponse.json({ id });
  } catch (err) { return handleGatewayError(err); }
}

export async function PATCH(req: NextRequest) {
  try {
    await getGatewayContext(req);
    const body = await req.json();
    await convexClient.mutation(api.functions.webhooks.update, {
      id: body.id as Id<"webhooks">,
      ...(body.url !== undefined && { url: body.url }),
      ...(body.events !== undefined && { events: body.events }),
      ...(body.secret !== undefined && { secret: body.secret }),
      ...(body.enabled !== undefined && { enabled: body.enabled }),
      ...(body.description !== undefined && { description: body.description }),
    });
    return NextResponse.json({ ok: true });
  } catch (err) { return handleGatewayError(err); }
}

export async function DELETE(req: NextRequest) {
  try {
    await getGatewayContext(req);
    const body = await req.json();
    await convexClient.mutation(api.functions.webhooks.remove, { id: body.id as Id<"webhooks"> });
    return NextResponse.json({ ok: true });
  } catch (err) { return handleGatewayError(err); }
}
