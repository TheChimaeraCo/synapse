import { NextRequest, NextResponse } from "next/server";
import { convexClient } from "@/lib/convex";
import { api } from "@/convex/_generated/api";
import { safeEqualSecret } from "@/lib/security";
import { buildCalendarIcs } from "@/lib/calendarIcs";
import { getCalendarEvents } from "@/lib/calendarStore";
import type { Id } from "@/convex/_generated/dataModel";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string; token: string }> },
) {
  try {
    const { slug, token } = await params;
    if (!slug || !token) {
      return new NextResponse("Not Found", { status: 404 });
    }

    const gateway = await convexClient.query(api.functions.gateways.getBySlug, { slug });
    if (!gateway) return new NextResponse("Not Found", { status: 404 });

    const expectedToken = await convexClient.query(api.functions.gatewayConfig.get, {
      gatewayId: gateway._id,
      key: "calendar.feed_token",
    }).catch(() => null);
    if (!safeEqualSecret(token, expectedToken || null)) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const events = await getCalendarEvents(gateway._id as Id<"gateways">);
    const ics = buildCalendarIcs(`${gateway.name} Calendar`, events);
    return new NextResponse(ics, {
      status: 200,
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Cache-Control": "public, max-age=300",
        "Content-Disposition": `inline; filename=\"${slug}.ics\"`,
      },
    });
  } catch {
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
