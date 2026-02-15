import { NextRequest, NextResponse } from "next/server";
import { getGatewayContext, handleGatewayError } from "@/lib/gateway-context";
import { convexClient } from "@/lib/convex";
import { api } from "@/convex/_generated/api";

export async function POST(req: NextRequest) {
  try {
    let gatewayId: string;
    const body = await req.json().catch(() => ({}));

    if (body.gatewayId) {
      gatewayId = body.gatewayId;
    } else {
      try {
        const ctx = await getGatewayContext(req);
        gatewayId = ctx.gatewayId;
      } catch {
        const gateways: any[] = await convexClient.query(api.functions.gateways.list as any, {});
        if (!gateways || gateways.length === 0) {
          return NextResponse.json({ error: "No gateways" }, { status: 400 });
        }
        gatewayId = gateways[0]._id;
      }
    }

    const result = await convexClient.mutation(api.functions.heartbeat.seedDefaults, { gatewayId: gatewayId as any });
    return NextResponse.json(result);
  } catch (err) {
    return handleGatewayError(err);
  }
}
