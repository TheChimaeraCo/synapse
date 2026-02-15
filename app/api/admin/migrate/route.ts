import { NextRequest, NextResponse } from "next/server";
import { getAuthContext, handleGatewayError } from "@/lib/gateway-context";
import { convexClient } from "@/lib/convex";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

/**
 * POST /api/admin/migrate
 * Triggers the migrateToMultiGateway mutation.
 * Only accessible to global admins.
 */
export async function POST(req: NextRequest) {
  try {
    const { userId } = await getAuthContext();

    // Check if user is global admin
    const user = await convexClient.query(api.functions.users.get, {
      id: userId as Id<"authUsers">,
    });
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    if (!(user as any).isGlobalAdmin && user.role !== "owner") {
      return NextResponse.json({ error: "Only global admins can run migrations" }, { status: 403 });
    }

    const results = await convexClient.mutation(api.functions.migration.migrateToMultiGateway);

    return NextResponse.json({ success: true, results });
  } catch (err: any) {
    return handleGatewayError(err);
  }
}
