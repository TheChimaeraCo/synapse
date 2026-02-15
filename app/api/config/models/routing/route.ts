import { NextRequest, NextResponse } from "next/server";
import { getGatewayContext, handleGatewayError } from "@/lib/gateway-context";
import { getConvexClient } from "@/lib/convex";
import { api } from "@/convex/_generated/api";
import { DEFAULT_ROUTING } from "@/lib/modelRouter";
import type { Id } from "@/convex/_generated/dataModel";

const CONFIG_KEY = "model_routing";

export async function GET(req: NextRequest) {
  try {
    const { gatewayId } = await getGatewayContext(req);
    const convex = getConvexClient();

    const result = await convex.query(api.functions.gatewayConfig.getWithInheritance, {
      gatewayId: gatewayId as Id<"gateways">,
      key: CONFIG_KEY,
    });
    const routing = result?.value ? JSON.parse(result.value) : DEFAULT_ROUTING;
    return NextResponse.json(routing);
  } catch (err) {
    // Fall back to systemConfig
    try {
      const { auth } = await import("@/auth");
      const session = await auth();
      if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      const { convexClient } = await import("@/lib/convex");
      const raw = await convexClient.query(api.functions.config.get, { key: CONFIG_KEY });
      return NextResponse.json(raw ? JSON.parse(raw) : DEFAULT_ROUTING);
    } catch {
      return handleGatewayError(err);
    }
  }
}

export async function PUT(req: NextRequest) {
  try {
    const { gatewayId } = await getGatewayContext(req);
    const convex = getConvexClient();
    const body = await req.json();

    const routing = {
      chat: body.chat || DEFAULT_ROUTING.chat,
      tool_use: body.tool_use || DEFAULT_ROUTING.tool_use,
      summary: body.summary || DEFAULT_ROUTING.summary,
      code: body.code || DEFAULT_ROUTING.code,
    };

    await convex.mutation(api.functions.gatewayConfig.set, {
      gatewayId: gatewayId as Id<"gateways">,
      key: CONFIG_KEY,
      value: JSON.stringify(routing),
    });

    return NextResponse.json(routing);
  } catch (err) {
    // Fall back to systemConfig
    try {
      const { auth } = await import("@/auth");
      const session = await auth();
      if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      const { convexClient } = await import("@/lib/convex");
      const body = await req.json();
      const routing = {
        chat: body.chat || DEFAULT_ROUTING.chat,
        tool_use: body.tool_use || DEFAULT_ROUTING.tool_use,
        summary: body.summary || DEFAULT_ROUTING.summary,
        code: body.code || DEFAULT_ROUTING.code,
      };
      await convexClient.mutation(api.functions.config.set, { key: CONFIG_KEY, value: JSON.stringify(routing) });
      return NextResponse.json(routing);
    } catch {
      return handleGatewayError(err);
    }
  }
}
