import { NextRequest, NextResponse } from "next/server";
import { getAuthContext, GatewayError } from "@/lib/gateway-context";
import { getConvexClient } from "@/lib/convex";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { getCurrentTier, getLimits, checkFeature } from "@/lib/license";

// Global config (systemConfig) - workspace_path, VAPID keys, etc.
// Only accessible to global admins (isGlobalAdmin or legacy owner role)

async function checkGlobalAdmin(userId: string) {
  const convex = getConvexClient();
  const user = await convex.query(api.functions.users.get, { id: userId as Id<"authUsers"> });
  if (!user) throw new GatewayError(401, "User not found");
  // Check isGlobalAdmin or legacy owner role
  if (!(user as any).isGlobalAdmin && user.role !== "owner") {
    throw new GatewayError(403, "Global admin access required");
  }
}

export async function GET(req: NextRequest) {
  try {
    const { userId } = await getAuthContext();
    await checkGlobalAdmin(userId);

    const convex = getConvexClient();
    const key = new URL(req.url).searchParams.get("key");

    if (key) {
      const val = await convex.query(api.functions.config.get, { key });
      return NextResponse.json({ [key]: val || "" });
    }

    // Return all global config with tier info
    const all = await convex.query(api.functions.config.getAll);
    const tier = getCurrentTier();
    const limits = getLimits();
    return NextResponse.json({ ...all, _tier: tier, _limits: { maxUsers: limits.maxUsers, maxGateways: limits.maxGateways } });
  } catch (err: any) {
    if (err instanceof GatewayError) {
      return NextResponse.json({ error: err.message }, { status: err.statusCode });
    }
    console.error("Global config GET error:", err);
    return NextResponse.json({ error: "Failed to fetch config" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { userId } = await getAuthContext();

    const convex = getConvexClient();

    // Allow during setup (first user completing setup)
    const setupComplete = await convex.query(api.functions.config.isSetupComplete);
    if (setupComplete) {
      await checkGlobalAdmin(userId);
    }

    const body = await req.json();

    if (body.key && body.value !== undefined) {
      await convex.mutation(api.functions.config.set, { key: body.key, value: String(body.value) });
      return NextResponse.json({ success: true });
    }

    // Bulk set
    for (const [key, value] of Object.entries(body)) {
      await convex.mutation(api.functions.config.set, { key, value: String(value) });
    }
    return NextResponse.json({ success: true });
  } catch (err: any) {
    if (err instanceof GatewayError) {
      return NextResponse.json({ error: err.message }, { status: err.statusCode });
    }
    console.error("Global config POST error:", err);
    return NextResponse.json({ error: "Failed to save config" }, { status: 500 });
  }
}
