import { NextRequest, NextResponse } from "next/server";
import { getAuthContext, handleGatewayError } from "@/lib/gateway-context";
import { convexClient } from "@/lib/convex";
import { api } from "@/convex/_generated/api";
import { buildDefaultSystemPrompt } from "@/lib/templates";
import type { Id } from "@/convex/_generated/dataModel";

/**
 * POST /api/setup/create-gateway
 * Called during initial setup to create the first (master) gateway.
 * Sets the user as global admin and creates the gateway with isMaster: true.
 */
export async function POST(req: NextRequest) {
  try {
    const { userId } = await getAuthContext();
    const body = await req.json();
    const { name, slug, description, icon, workspacePath } = body;

    if (!name || !slug) {
      return NextResponse.json({ error: "Name and slug are required" }, { status: 400 });
    }

    // Check if setup is already complete
    const setupComplete = await convexClient.query(api.functions.config.isSetupComplete);
    if (setupComplete) {
      return NextResponse.json({ error: "Setup already complete" }, { status: 400 });
    }

    // Mark user as global admin (first user)
    await convexClient.mutation(api.functions.users.updateProfile, {
      id: userId as Id<"authUsers">,
    });
    // Set isGlobalAdmin directly
    try {
      await convexClient.mutation(api.functions.users.setGlobalAdmin, {
        id: userId as Id<"authUsers">,
        isGlobalAdmin: true,
      });
    } catch {
      // If mutation doesn't exist yet, we'll add it
      console.warn("setGlobalAdmin mutation not available, skipping");
    }

    // Create the master gateway
    const gatewayId = await convexClient.mutation(api.functions.gateways.create, {
      name,
      slug,
      ownerId: userId as Id<"authUsers">,
      isMaster: true,
      workspacePath: workspacePath || undefined,
      description: description || undefined,
      icon: icon || undefined,
    });

    // Update user's gatewayId for backward compat
    await convexClient.mutation(api.functions.users.updateGatewayId, {
      id: userId as Id<"authUsers">,
      gatewayId: gatewayId as Id<"gateways">,
    });

    return NextResponse.json({ gatewayId, success: true }, { status: 201 });
  } catch (err: any) {
    return handleGatewayError(err);
  }
}
