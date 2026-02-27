import { NextRequest, NextResponse } from "next/server";
import { GatewayError, getGatewayContext, handleGatewayError } from "@/lib/gateway-context";
import { getConvexClient } from "@/lib/convex";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

function requireManager(role: string) {
  if (role !== "owner" && role !== "admin") {
    throw new GatewayError(403, "Owner/admin role required");
  }
}

export async function GET(req: NextRequest) {
  try {
    const { gatewayId, role } = await getGatewayContext(req);
    requireManager(role);

    const convex = getConvexClient();
    const state = await convex.query((api as any).functions.autonomy.getState, {
      gatewayId: gatewayId as Id<"gateways">,
    });
    return NextResponse.json(state);
  } catch (err) {
    return handleGatewayError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const { gatewayId, role } = await getGatewayContext(req);
    requireManager(role);

    const body = await req.json().catch(() => ({}));
    const convex = getConvexClient();

    if (body?.action === "run_once") {
      const res = await convex.mutation((api as any).functions.autonomy.triggerNow, {
        gatewayId: gatewayId as Id<"gateways">,
        reason: "manual_api",
      });
      return NextResponse.json(res);
    }

    const updated = await convex.mutation((api as any).functions.autonomy.setSettings, {
      gatewayId: gatewayId as Id<"gateways">,
      enabled: typeof body?.enabled === "boolean" ? body.enabled : undefined,
      maxDispatchPerTick: Number.isFinite(body?.maxDispatchPerTick) ? Number(body.maxDispatchPerTick) : undefined,
      maxActiveWorkers: Number.isFinite(body?.maxActiveWorkers) ? Number(body.maxActiveWorkers) : undefined,
      taskDueWindowHours: Number.isFinite(body?.taskDueWindowHours) ? Number(body.taskDueWindowHours) : undefined,
      dispatchCooldownMinutes: Number.isFinite(body?.dispatchCooldownMinutes)
        ? Number(body.dispatchCooldownMinutes)
        : undefined,
      requireCleanApprovalQueue: typeof body?.requireCleanApprovalQueue === "boolean"
        ? body.requireCleanApprovalQueue
        : undefined,
      channelPlatform: typeof body?.channelPlatform === "string" ? body.channelPlatform : undefined,
      externalUserId: typeof body?.externalUserId === "string" ? body.externalUserId : undefined,
      agentId: typeof body?.agentId === "string" ? body.agentId : undefined,
    });

    return NextResponse.json(updated);
  } catch (err) {
    return handleGatewayError(err);
  }
}
