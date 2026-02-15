import { NextRequest, NextResponse } from "next/server";
import { getGatewayContext, handleGatewayError } from "@/lib/gateway-context";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL || process.env.CONVEX_SELF_HOSTED_URL || "http://127.0.0.1:3220");

export async function POST(req: NextRequest) {
  try {
    await getGatewayContext(req);
    const body = await req.json();
    await convex.mutation(api.functions.pushSubscriptions.subscribe, {
      endpoint: body.endpoint,
      keys: { p256dh: body.keys.p256dh, auth: body.keys.auth },
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleGatewayError(err);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    await getGatewayContext(req);
    const { endpoint } = await req.json();
    await convex.mutation(api.functions.pushSubscriptions.unsubscribe, { endpoint });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleGatewayError(err);
  }
}
