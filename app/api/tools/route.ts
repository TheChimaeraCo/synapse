import { NextRequest, NextResponse } from "next/server";
import { getGatewayContext, handleGatewayError } from "@/lib/gateway-context";
import { convexClient } from "@/lib/convex";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { BUILTIN_TOOLS, TOOL_REGISTRY } from "@/lib/builtinTools";

export async function GET(req: NextRequest) {
  try {
    const { gatewayId } = await getGatewayContext(req);

    const existing = await convexClient.query(api.functions.tools.list, {
      gatewayId: gatewayId as Id<"gateways">,
    });

    if (existing.length === 0) {
      for (const tool of BUILTIN_TOOLS) {
        await convexClient.mutation(api.functions.tools.create, {
          gatewayId: gatewayId as Id<"gateways">,
          name: tool.name,
          description: tool.description,
          category: tool.category,
          enabled: true,
          requiresApproval: tool.requiresApproval,
          parameters: tool.parameters,
        });
      }
      const seeded = await convexClient.query(api.functions.tools.list, {
        gatewayId: gatewayId as Id<"gateways">,
      });
      return NextResponse.json({ tools: seeded });
    }

    // Filter tools by availability (some require higher tier)
    const available = existing.filter((t: any) => TOOL_REGISTRY.has(t.name));
    return NextResponse.json({ tools: available });
  } catch (err) {
    return handleGatewayError(err);
  }
}

export async function PUT(req: NextRequest) {
  try {
    await getGatewayContext(req);
    const { id, enabled, requiresApproval } = await req.json();
    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }
    await convexClient.mutation(api.functions.tools.update, {
      id: id as Id<"tools">,
      ...(enabled !== undefined ? { enabled } : {}),
      ...(requiresApproval !== undefined ? { requiresApproval } : {}),
    });
    return NextResponse.json({ success: true });
  } catch (err) {
    return handleGatewayError(err);
  }
}
