import { NextRequest, NextResponse } from "next/server";
import { getGatewayContext, handleGatewayError, GatewayError } from "@/lib/gateway-context";
import { ensureCalendarFeedToken, rotateCalendarFeedToken } from "@/lib/calendarStore";
import { convexClient } from "@/lib/convex";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

function buildFeedUrl(req: NextRequest, slug: string, token: string): string {
  const origin = req.nextUrl.origin;
  return `${origin}/api/calendar/feed/${encodeURIComponent(slug)}/${encodeURIComponent(token)}`;
}

export async function GET(req: NextRequest) {
  try {
    const { gatewayId } = await getGatewayContext(req);
    const gateway = await convexClient.query(api.functions.gateways.get, {
      id: gatewayId as Id<"gateways">,
    });
    if (!gateway) return NextResponse.json({ error: "Gateway not found" }, { status: 404 });

    const token = await ensureCalendarFeedToken(gatewayId as Id<"gateways">);
    return NextResponse.json({
      token,
      feedUrl: buildFeedUrl(req, gateway.slug, token),
    });
  } catch (err) {
    return handleGatewayError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const { gatewayId, role } = await getGatewayContext(req);
    if (role === "viewer") throw new GatewayError(403, "Viewer role cannot rotate feed tokens");
    const gateway = await convexClient.query(api.functions.gateways.get, {
      id: gatewayId as Id<"gateways">,
    });
    if (!gateway) return NextResponse.json({ error: "Gateway not found" }, { status: 404 });

    const token = await rotateCalendarFeedToken(gatewayId as Id<"gateways">);
    return NextResponse.json({
      token,
      feedUrl: buildFeedUrl(req, gateway.slug, token),
    });
  } catch (err) {
    return handleGatewayError(err);
  }
}
