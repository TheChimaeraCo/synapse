import { NextRequest, NextResponse } from "next/server";
import { getGatewayContext, handleGatewayError } from "@/lib/gateway-context";
import { getConvexClient } from "@/lib/convex";
import { api } from "@/convex/_generated/api";

const convex = getConvexClient();

export async function GET(req: NextRequest) {
  try {
    const { gatewayId } = await getGatewayContext(req);
    const status = req.nextUrl.searchParams.get("status") as "pending" | "read" | "replied" | null;

    const messages = await convex.query(api.functions.agentMessages.listInbox, {
      gatewayId: gatewayId as any,
      status: status || undefined,
    });
    return NextResponse.json(messages);
  } catch (err) {
    return handleGatewayError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const { gatewayId } = await getGatewayContext(req);
    const body = await req.json();
    const { toGatewayId, fromAgentId, toAgentId, content, type } = body;

    if (!toGatewayId || !fromAgentId || !content) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const id = await convex.mutation(api.functions.agentMessages.send, {
      fromGatewayId: gatewayId as any,
      toGatewayId,
      fromAgentId,
      toAgentId: toAgentId || undefined,
      content,
      type: type || "request",
    });

    return NextResponse.json({ id });
  } catch (err) {
    return handleGatewayError(err);
  }
}
