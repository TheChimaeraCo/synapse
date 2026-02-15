import { NextResponse } from "next/server";
import { getGatewayContext, handleGatewayError } from "@/lib/gateway-context";
import { convexClient } from "@/lib/convex";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

export async function GET(req: Request) {
  try {
    const { gatewayId } = await getGatewayContext(req);
    const result = await convexClient.query(api.functions.usage.checkBudget, {
      gatewayId: gatewayId as Id<"gateways">,
    });
    return NextResponse.json(result);
  } catch (err) {
    return handleGatewayError(err);
  }
}
