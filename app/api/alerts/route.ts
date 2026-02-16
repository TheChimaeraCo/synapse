import { NextRequest, NextResponse } from "next/server";
import { getGatewayContext, handleGatewayError } from "@/lib/gateway-context";
import { getConvexClient } from "@/lib/convex";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

export async function GET(req: NextRequest) {
  try {
    const { role } = await getGatewayContext(req);
    if (role !== "owner" && role !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const convex = getConvexClient();
    const { searchParams } = new URL(req.url);
    const unacknowledgedOnly = searchParams.get("unacknowledged") === "true";
    const limit = parseInt(searchParams.get("limit") || "50");

    const alerts = await convex.query(api.functions.systemAlerts.list, {
      limit,
      unacknowledgedOnly,
    });
    return NextResponse.json(alerts);
  } catch (err) {
    return handleGatewayError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const { role, userId } = await getGatewayContext(req);
    if (role !== "owner" && role !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const convex = getConvexClient();
    const body = await req.json();

    if (body.action === "acknowledge") {
      if (body.id) {
        await convex.mutation(api.functions.systemAlerts.acknowledge, {
          id: body.id as Id<"systemAlerts">,
          userId: userId as Id<"authUsers">,
        });
      } else {
        await convex.mutation(api.functions.systemAlerts.acknowledgeAll, {
          userId: userId as Id<"authUsers">,
        });
      }
      return NextResponse.json({ ok: true });
    }

    // Create alert
    const id = await convex.mutation(api.functions.systemAlerts.create, {
      level: body.level || "info",
      message: body.message,
      source: body.source || "manual",
    });
    return NextResponse.json({ id });
  } catch (err) {
    return handleGatewayError(err);
  }
}
