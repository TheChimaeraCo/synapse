import { NextRequest, NextResponse } from "next/server";
import { getGatewayContext, handleGatewayError, GatewayError } from "@/lib/gateway-context";
import { parseCalendarTimestamp, removeCalendarEvent, updateCalendarEvent } from "@/lib/calendarStore";
import type { Id } from "@/convex/_generated/dataModel";

function requireCalendarEditor(role: string) {
  if (role === "viewer") {
    throw new GatewayError(403, "Viewer role cannot modify calendar events");
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { gatewayId, role } = await getGatewayContext(req);
    requireCalendarEditor(role);
    const { id } = await params;
    const body = await req.json();

    const patch: any = {};
    if (body.title !== undefined) patch.title = body.title;
    if (body.description !== undefined) patch.description = body.description;
    if (body.location !== undefined) patch.location = body.location;
    if (body.allDay !== undefined) patch.allDay = !!body.allDay;
    if (body.startAt !== undefined) {
      const ts = parseCalendarTimestamp(body.startAt);
      if (ts == null) return NextResponse.json({ error: "Invalid startAt" }, { status: 400 });
      patch.startAt = ts;
    }
    if (body.endAt !== undefined) {
      const ts = parseCalendarTimestamp(body.endAt);
      if (ts == null) return NextResponse.json({ error: "Invalid endAt" }, { status: 400 });
      patch.endAt = ts;
    }

    const event = await updateCalendarEvent(gatewayId as Id<"gateways">, id, patch);
    if (!event) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ event });
  } catch (err) {
    return handleGatewayError(err);
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { gatewayId, role } = await getGatewayContext(req);
    requireCalendarEditor(role);
    const { id } = await params;
    const removed = await removeCalendarEvent(gatewayId as Id<"gateways">, id);
    if (!removed) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleGatewayError(err);
  }
}
