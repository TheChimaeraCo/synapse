import { NextRequest, NextResponse } from "next/server";
import { getGatewayContext, handleGatewayError } from "@/lib/gateway-context";
import { sendPushToAll } from "@/lib/pushService";

export async function POST(req: NextRequest) {
  try {
    await getGatewayContext(req);
    const { title, body, url } = await req.json();
    const result = await sendPushToAll({ title: title || "Synapse", body: body || "New notification", url });
    return NextResponse.json(result);
  } catch (err) {
    return handleGatewayError(err);
  }
}
