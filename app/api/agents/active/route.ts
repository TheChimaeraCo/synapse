import { NextResponse } from "next/server";
import { getGatewayContext, handleGatewayError } from "@/lib/gateway-context";
import { convexClient } from "@/lib/convex";
import { api } from "@/convex/_generated/api";

export async function GET(req: Request) {
  try {
    await getGatewayContext(req);
    const agents = await convexClient.query(api.functions.workerAgents.listAll, { limit: 50 });
    return NextResponse.json({ agents });
  } catch (err) {
    return handleGatewayError(err);
  }
}
