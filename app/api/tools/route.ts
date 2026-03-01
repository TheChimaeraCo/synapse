import { NextRequest, NextResponse } from "next/server";
import { GatewayError, getGatewayContext, handleGatewayError } from "@/lib/gateway-context";
import { convexClient } from "@/lib/convex";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { BUILTIN_TOOLS, TOOL_REGISTRY } from "@/lib/builtinTools";

function requireToolManager(role: string) {
  if (role !== "owner" && role !== "admin") {
    throw new GatewayError(403, "Owner/admin role required");
  }
}

export async function GET(req: NextRequest) {
  try {
    const { gatewayId } = await getGatewayContext(req);

    const existing = await convexClient.query(api.functions.tools.list, {
      gatewayId: gatewayId as Id<"gateways">,
    });

    const existingNames = new Set(existing.map((t: any) => t.name));
    const missing = BUILTIN_TOOLS.filter((tool) => !existingNames.has(tool.name));
    if (missing.length > 0) {
      for (const tool of missing) {
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
    }

    const all = await convexClient.query(api.functions.tools.list, {
      gatewayId: gatewayId as Id<"gateways">,
    });

    // Keep builtins that exist in the runtime registry, plus dynamic/custom tools.
    const available = all.filter((t: any) => TOOL_REGISTRY.has(t.name) || Boolean(t.handlerCode));
    return NextResponse.json({ tools: available });
  } catch (err) {
    return handleGatewayError(err);
  }
}

export async function PUT(req: NextRequest) {
  try {
    const { role } = await getGatewayContext(req);
    requireToolManager(role);
    const {
      id,
      enabled,
      requiresApproval,
      providerProfileId,
      provider,
      model,
      description,
      category,
      parameters,
      handlerCode,
    } = await req.json();
    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }
    await convexClient.mutation(api.functions.tools.update, {
      id: id as Id<"tools">,
      ...(enabled !== undefined ? { enabled } : {}),
      ...(requiresApproval !== undefined ? { requiresApproval } : {}),
      ...(providerProfileId !== undefined ? { providerProfileId } : {}),
      ...(provider !== undefined ? { provider } : {}),
      ...(model !== undefined ? { model } : {}),
      ...(description !== undefined ? { description } : {}),
      ...(category !== undefined ? { category } : {}),
      ...(parameters !== undefined ? { parameters } : {}),
      ...(handlerCode !== undefined ? { handlerCode } : {}),
    });
    return NextResponse.json({ success: true });
  } catch (err) {
    return handleGatewayError(err);
  }
}
