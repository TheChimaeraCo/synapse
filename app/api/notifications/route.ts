import { NextRequest, NextResponse } from "next/server";
import { getGatewayContext, handleGatewayError } from "@/lib/gateway-context";
import { convexClient } from "@/lib/convex";
import { api } from "@/convex/_generated/api";

export async function GET(req: Request) {
  try {
    await getGatewayContext(req);
    const [unread, recent] = await Promise.all([
      convexClient.query(api.functions.notifications.getUnread, {}),
      convexClient.query(api.functions.notifications.getRecent, { limit: 50 }),
    ]);
    return NextResponse.json({ unread, recent });
  } catch (err) {
    return handleGatewayError(err);
  }
}

export async function PUT(req: NextRequest) {
  try {
    await getGatewayContext(req);
    const body = await req.json();

    if (body.id && !body.markAllRead) {
      await convexClient.mutation(api.functions.notifications.markRead, { id: body.id });
      return NextResponse.json({ success: true });
    }
    if (body.markAllRead || body.action === "markAllRead") {
      await convexClient.mutation(api.functions.notifications.markAllRead, {});
      return NextResponse.json({ success: true });
    }
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (err) {
    return handleGatewayError(err);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    await getGatewayContext(req);
    const url = new URL(req.url);
    const id = url.searchParams.get("id");

    if (id) {
      await convexClient.mutation(api.functions.notifications.remove, { id: id as any });
    } else {
      await convexClient.mutation(api.functions.notifications.clearAll, {});
    }
    return NextResponse.json({ success: true });
  } catch (err) {
    return handleGatewayError(err);
  }
}
