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

    // Create the master gateway (or return existing if slug taken)
    let gatewayId: string;
    try {
      gatewayId = await convexClient.mutation(api.functions.gateways.create, {
        name,
        slug,
        ownerId: userId as Id<"authUsers">,
        isMaster: true,
        workspacePath: workspacePath || undefined,
        description: description || undefined,
        icon: icon || undefined,
      });
    } catch (err: any) {
      if (err.message?.includes("slug already exists")) {
        // Gateway already created (page refresh during setup) - find and update it
        const gateways = await convexClient.query(api.functions.gateways.list);
        const existing = gateways.find((g: any) => g.slug === slug);
        if (existing) {
          gatewayId = existing._id;
          // Update with latest values in case user changed them
          await convexClient.mutation(api.functions.gateways.update, {
            id: existing._id as Id<"gateways">,
            name,
            description: description || undefined,
            icon: icon || undefined,
            workspacePath: workspacePath || undefined,
          });
        } else {
          throw err;
        }
      } else {
        throw err;
      }
    }

    // Create owner membership so /api/gateways can find it
    try {
      await convexClient.mutation(api.functions.gatewayMembers.add, {
        gatewayId: gatewayId as Id<"gateways">,
        userId: userId as Id<"authUsers">,
        role: "owner",
        addedBy: userId as Id<"authUsers">,
      });
    } catch (e: any) {
      if (!e.message?.includes("already a member")) {
        console.warn("Failed to create owner membership:", e);
      }
    }

    // Create workspace directory
    const wsPath = workspacePath?.trim();
    if (wsPath) {
      try {
        const { mkdir } = await import("fs/promises");
        await mkdir(wsPath, { recursive: true });
      } catch (e: any) {
        console.warn("Failed to create workspace dir:", e.message);
      }
    }

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
