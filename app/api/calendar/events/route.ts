import { NextRequest, NextResponse } from "next/server";
import { getGatewayContext, handleGatewayError, GatewayError } from "@/lib/gateway-context";
import { addCalendarEvent, getCalendarEvents, parseCalendarTimestamp } from "@/lib/calendarStore";
import type { Id } from "@/convex/_generated/dataModel";

function requireCalendarEditor(role: string) {
  if (role === "viewer") {
    throw new GatewayError(403, "Viewer role cannot modify calendar events");
  }
}

export async function GET(req: NextRequest) {
  try {
    const { gatewayId } = await getGatewayContext(req);
    const events = await getCalendarEvents(gatewayId as Id<"gateways">);
    return NextResponse.json({ events });
  } catch (err) {
    return handleGatewayError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const { gatewayId, role } = await getGatewayContext(req);
    requireCalendarEditor(role);
    const body = await req.json();

    const title = typeof body.title === "string" ? body.title.trim() : "";
    const startAt = parseCalendarTimestamp(body.startAt);
    let endAt = parseCalendarTimestamp(body.endAt);
    if (!title || startAt == null) {
      return NextResponse.json({ error: "title and startAt are required" }, { status: 400 });
    }
    if (endAt == null || endAt <= startAt) {
      endAt = startAt + 60 * 60 * 1000;
    }

    const event = await addCalendarEvent(gatewayId as Id<"gateways">, {
      title,
      startAt,
      endAt,
      allDay: !!body.allDay,
      location: typeof body.location === "string" ? body.location : undefined,
      description: typeof body.description === "string" ? body.description : undefined,
      source: "user",
    });

    return NextResponse.json({ event }, { status: 201 });
  } catch (err) {
    return handleGatewayError(err);
  }
}
