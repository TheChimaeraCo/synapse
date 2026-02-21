import { NextRequest, NextResponse } from "next/server";
import { getAuthContext, handleGatewayError } from "@/lib/gateway-context";
import { convexClient } from "@/lib/convex";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { mkdirSync, writeFileSync, existsSync } from "fs";
import { join } from "path";

/**
 * POST /api/setup/initialize
 * Creates the default agent and channels after setup completion.
 */
export async function POST(req: NextRequest) {
  try {
    const { userId } = await getAuthContext();
    const body = await req.json();
    const { gatewayId, hasTelegram } = body;

    if (!gatewayId) {
      return NextResponse.json({ error: "Gateway ID required" }, { status: 400 });
    }

    const gid = gatewayId as Id<"gateways">;

    // Check if agent already exists for this gateway
    const existingAgents = await convexClient.query(api.functions.agents.list, { gatewayId: gid });
    let agentId: Id<"agents">;

    if (existingAgents.length > 0) {
      agentId = existingAgents[0]._id;
    } else {
      // Create default agent
      agentId = await convexClient.mutation(api.functions.agents.create, {
        gatewayId: gid,
        name: "Synapse",
        slug: "synapse",
        model: "claude-sonnet-4-20250514",
        systemPrompt: "You are Synapse, a helpful AI assistant. Be concise, accurate, and helpful.",
        temperature: 0.7,
        maxTokens: 4096,
      });
    }

    // Check existing channels
    const existingChannels = await convexClient.query(api.functions.channels.list, { gatewayId: gid });
    const existingPlatforms = new Set(existingChannels.map((c: any) => c.platform));

    // Create web chat channel if not exists
    if (!existingPlatforms.has("hub")) {
      await convexClient.mutation(api.functions.channels.create, {
        gatewayId: gid,
        platform: "hub",
        name: "Web Chat",
        agentId,
        config: {},
      });
    }

    // Create Telegram channel if token was provided and not exists
    if (hasTelegram && !existingPlatforms.has("telegram")) {
      await convexClient.mutation(api.functions.channels.create, {
        gatewayId: gid,
        platform: "telegram",
        name: "Telegram",
        agentId,
        config: {},
      });
    }

    // Initialize workspace directory with starter files
    const gateway = await convexClient.query(api.functions.gateways.get, { id: gid });
    if (gateway?.workspacePath) {
      const wsPath = gateway.workspacePath;
      if (!existsSync(wsPath)) mkdirSync(wsPath, { recursive: true });

      // Get agent for system prompt
      const agent = existingAgents.length > 0
        ? existingAgents[0]
        : await convexClient.query(api.functions.agents.get, { id: agentId });

      if (agent?.systemPrompt) {
        writeFileSync(join(wsPath, "SOUL.md"), agent.systemPrompt);
      }

      if (!existsSync(join(wsPath, "MEMORY.md"))) {
        writeFileSync(join(wsPath, "MEMORY.md"), "# Memory\n\nThis file stores long-term memories and learned context.\n");
      }

      const memDir = join(wsPath, "memory");
      if (!existsSync(memDir)) mkdirSync(memDir, { recursive: true });
    }

    return NextResponse.json({ success: true, agentId });
  } catch (err: any) {
    return handleGatewayError(err);
  }
}
