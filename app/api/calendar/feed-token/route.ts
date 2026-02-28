import { NextRequest, NextResponse } from "next/server";
import { getGatewayContext, handleGatewayError, GatewayError } from "@/lib/gateway-context";
import { ensureCalendarFeedToken, rotateCalendarFeedToken } from "@/lib/calendarStore";
import { convexClient } from "@/lib/convex";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

function pickForwarded(headersValue: string | null): string | null {
  if (!headersValue) return null;
  return headersValue.split(",")[0]?.trim() || null;
}

function derivePublicOrigin(req: NextRequest): string {
  const xfProto = pickForwarded(req.headers.get("x-forwarded-proto"));
  const xfHost = pickForwarded(req.headers.get("x-forwarded-host"));
  if (xfProto && xfHost) {
    return `${xfProto}://${xfHost}`;
  }

  const origin = req.headers.get("origin");
  if (origin) return origin;

  const host = req.headers.get("host");
  if (host) {
    const proto = req.nextUrl.protocol?.replace(":", "") || "https";
    return `${proto}://${host}`;
  }

  return req.nextUrl.origin;
}

function buildFeedUrl(req: NextRequest, slug: string, token: string): string {
  const origin = derivePublicOrigin(req);
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
