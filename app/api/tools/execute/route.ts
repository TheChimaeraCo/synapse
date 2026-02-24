import { NextRequest, NextResponse } from "next/server";
import { getGatewayContext, GatewayError, handleGatewayError } from "@/lib/gateway-context";
import { convexClient } from "@/lib/convex";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { readModuleConfig, findModuleForTool } from "@/lib/modules/config";
import { executeDynamicTool } from "@/lib/toolExecutor";

export async function POST(req: NextRequest) {
  try {
    console.log("[ToolExecute] Incoming request");
    const ctx = await getGatewayContext(req);
    const { gatewayId, userId, role } = ctx;
    console.log("[ToolExecute] Auth OK, gateway:", gatewayId);

    const body = await req.json();
    const { toolName, args } = body;

    if (!toolName || typeof toolName !== "string") {
      return NextResponse.json({ error: "toolName is required" }, { status: 400 });
    }

    // Load module config to find the tool
    const moduleConfig = await readModuleConfig(gatewayId as Id<"gateways">);
    const module = findModuleForTool(toolName, moduleConfig.installedModules);

    // Find the tool definition (check installed modules first, then DB tools)
    let handlerCode: string | undefined;

    if (module) {
      const moduleTool = module.tools?.find((t: any) => t.name === toolName);
      if (moduleTool?.handlerCode) {
        handlerCode = moduleTool.handlerCode;
      }
    }

    if (!handlerCode) {
      // Check DB tools
      const dbTools = await convexClient.query(api.functions.tools.list, {
        gatewayId: gatewayId as Id<"gateways">,
      });
      const dbTool = dbTools.find((t: any) => t.name === toolName);
      if (dbTool?.handlerCode) {
        handlerCode = dbTool.handlerCode;
      }
    }

    if (!handlerCode) {
      console.log("[ToolExecute] Tool not found:", toolName);
      return NextResponse.json({ error: `Tool not found: ${toolName}` }, { status: 404 });
    }
    console.log("[ToolExecute] Executing tool:", toolName, "module:", module?.id);

    const toolContext = {
      gatewayId: gatewayId as string,
      agentId: "",
      sessionId: "",
      userId: userId as string,
      userRole: role,
    };

    const result = await executeDynamicTool(
      handlerCode,
      args || {},
      toolContext,
      module?.id,
    );

    // Try to parse as JSON if possible
    try {
      const parsed = JSON.parse(result);
      // If the result is an array, wrap it so UI can access it as .items
      if (Array.isArray(parsed)) {
        return NextResponse.json({ items: parsed });
      }
      // If it's an object, return as-is
      if (parsed && typeof parsed === "object") {
        return NextResponse.json(parsed);
      }
      return NextResponse.json({ result: parsed });
    } catch {
      return NextResponse.json({ result });
    }
  } catch (err: any) {
    if (err instanceof GatewayError) {
      return handleGatewayError(err);
    }
    console.error("[ToolExecute] Error:", err);
    return NextResponse.json({ error: err.message || "Internal error" }, { status: 500 });
  }
}
