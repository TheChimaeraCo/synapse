import { NextRequest, NextResponse } from "next/server";
import { getGatewayContext, GatewayError } from "@/lib/gateway-context";
import { convexClient } from "@/lib/convex";
import { api } from "@/convex/_generated/api";

export async function GET(req: NextRequest) {
  try {
    await getGatewayContext(req);
  } catch (err) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const stats = await convexClient.query(api.functions.toolCache.stats, {});
    return NextResponse.json(stats);
  } catch {
    return NextResponse.json({ total: 0, active: 0, expired: 0, byTool: {} });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    await getGatewayContext(req);
  } catch (err) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const result = await convexClient.mutation(api.functions.toolCache.clearAll, {});
    return NextResponse.json(result);
  } catch (err: any) {
    console.error("Tool cache clear error:", err);
    return NextResponse.json({ error: "Failed to clear cache" }, { status: 500 });
  }
}
