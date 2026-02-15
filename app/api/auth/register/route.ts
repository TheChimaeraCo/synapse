import { NextRequest, NextResponse } from "next/server";
import { hash } from "bcryptjs";
import { convexClient } from "@/lib/convex";
import { api } from "@/convex/_generated/api";
import { buildDefaultSystemPrompt } from "@/lib/templates";
import type { Id } from "@/convex/_generated/dataModel";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const email = (body.email || "").trim().toLowerCase();
    const password = body.password || "";
    const name = (body.name || "").trim();
    const inviteCode = body.inviteCode || null;
    const isSetup = body.isSetup === true;

    if (!email || !password) {
      return NextResponse.json({ error: "Email and password are required" }, { status: 400 });
    }
    if (password.length < 8) {
      return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
    }

    // Check if setup is complete
    const setupComplete = await convexClient.query(api.functions.config.isSetupComplete);

    // After setup: require invite code (unless this IS the setup flow)
    if (setupComplete && !isSetup && !inviteCode) {
      return NextResponse.json({ error: "An invite code is required to register" }, { status: 403 });
    }

    // Validate invite code if provided
    let invite: any = null;
    if (inviteCode) {
      invite = await convexClient.query(api.functions.gatewayInvites.getByCode, { code: inviteCode });
      if (!invite) {
        return NextResponse.json({ error: "Invalid or expired invite code" }, { status: 400 });
      }
    }

    // Check if user already exists
    const existing = await convexClient.query(api.functions.users.getByEmail, { email });
    if (existing) {
      // If user exists and has an invite, accept the invite for them
      if (invite) {
        try {
          await convexClient.mutation(api.functions.gatewayInvites.use, {
            code: inviteCode,
            userId: existing._id,
          });
          return NextResponse.json({ success: true, gatewayId: invite.gatewayId });
        } catch (err: any) {
          // Already a member is fine
          if (err.message?.includes("Already a member")) {
            return NextResponse.json({ success: true, gatewayId: invite.gatewayId });
          }
        }
      }
      return NextResponse.json({ error: "Email already in use" }, { status: 409 });
    }

    const passwordHash = await hash(password, 12);

    // During setup: create user with placeholder gatewayId (setup flow creates gateway separately)
    // With invite: create user and auto-accept invite
    // Without invite (pre-setup): create with placeholder
    const userId = await convexClient.mutation(api.functions.users.create, {
      email,
      name: name || email.split("@")[0],
      passwordHash,
      role: isSetup ? "owner" : "user",
      gatewayId: "pending",
    });

    let gatewayId: string | null = null;

    // Auto-accept invite if provided
    if (invite) {
      try {
        gatewayId = await convexClient.mutation(api.functions.gatewayInvites.use, {
          code: inviteCode,
          userId: userId as Id<"authUsers">,
        });
        // Update user's gatewayId for backward compat
        if (gatewayId) {
          await convexClient.mutation(api.functions.users.updateGatewayId, {
            id: userId as Id<"authUsers">,
            gatewayId: gatewayId as Id<"gateways">,
          });
        }
      } catch (err: any) {
        console.warn("Failed to auto-accept invite:", err.message);
      }
    }

    // If setup and no invite (first user), gateway is created via /api/setup/create-gateway
    // Don't create default gateway here - the setup flow handles it

    return NextResponse.json({ success: true, gatewayId });
  } catch (err: any) {
    console.error("Registration error:", err);
    return NextResponse.json({ error: err.message || "Registration failed" }, { status: 500 });
  }
}
