import { NextRequest, NextResponse } from "next/server";
import { getGatewayContext, handleGatewayError } from "@/lib/gateway-context";
import { convexClient } from "@/lib/convex";
import { api } from "@/convex/_generated/api";

export async function POST(req: NextRequest) {
  try {
    let gatewayId: string;
    try {
      const ctx = await getGatewayContext(req);
      gatewayId = ctx.gatewayId;
    } catch {
      // Fall back to first gateway
      const gateways: any[] = await convexClient.query(api.functions.gateways.list as any, {});
      if (!gateways || gateways.length === 0) {
        return NextResponse.json({ error: "No gateways" }, { status: 400 });
      }
      gatewayId = gateways[0]._id;
    }

    const runs = await convexClient.query(api.functions.heartbeat.getRuns, { gatewayId: gatewayId as any, limit: 1 });

    return NextResponse.json({
      message: "Heartbeat runs every 5 minutes via Convex cron. Latest run below.",
      latestRun: runs[0] ?? null,
    });
  } catch (err) {
    return handleGatewayError(err);
  }
}
