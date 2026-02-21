import { NextRequest, NextResponse } from "next/server";
import { getGatewayContext, GatewayError, handleGatewayError } from "@/lib/gateway-context";
import { getConvexClient } from "@/lib/convex";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

function requireApprovalManager(role: string) {
  if (role !== "owner" && role !== "admin") {
    throw new GatewayError(403, "Owner/admin role required");
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { gatewayId, role } = await getGatewayContext(req);
    requireApprovalManager(role);

    const convex = getConvexClient();
    const { id } = await params;
    const body = await req.json();
    const status = body?.status;

    if (status !== "approved" && status !== "denied") {
      return NextResponse.json({ error: "status must be approved or denied" }, { status: 400 });
    }

    const approval = await convex.query(api.functions.approvals.getById, {
      id: id as Id<"approvals">,
    });
    if (!approval) {
      return NextResponse.json({ error: "Approval not found" }, { status: 404 });
    }
    if (String(approval.gatewayId) !== gatewayId) {
      return NextResponse.json({ error: "Approval does not belong to this gateway" }, { status: 403 });
    }
    if (approval.status !== "pending") {
      return NextResponse.json({ error: "Approval already resolved" }, { status: 409 });
    }

    await convex.mutation(api.functions.approvals.resolve, {
      id: id as Id<"approvals">,
      status,
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    return handleGatewayError(err);
  }
}
