import { v } from "convex/values";
import { query, mutation } from "../_generated/server";

export const getOnboardingState = query({
  args: { gatewayId: v.id("gateways"), userId: v.id("authUsers") },
  handler: async (ctx, args) => {
    const state = await ctx.db
      .query("onboardingState")
      .withIndex("by_user_gateway", (q) => q.eq("userId", args.userId).eq("gatewayId", args.gatewayId))
      .first();
    return state;
  },
});

export const startOnboarding = mutation({
  args: { gatewayId: v.id("gateways"), userId: v.id("authUsers") },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("onboardingState")
      .withIndex("by_user_gateway", (q) => q.eq("userId", args.userId).eq("gatewayId", args.gatewayId))
      .first();
    if (existing) return existing._id;

    return await ctx.db.insert("onboardingState", {
      gatewayId: args.gatewayId,
      userId: args.userId,
      status: "in_progress",
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  },
});

export const saveMessage = mutation({
  args: {
    gatewayId: v.id("gateways"),
    userId: v.id("authUsers"),
    role: v.string(),
    content: v.string(),
  },
  handler: async (ctx, args) => {
    const state = await ctx.db
      .query("onboardingState")
      .withIndex("by_user_gateway", (q) => q.eq("userId", args.userId).eq("gatewayId", args.gatewayId))
      .first();
    if (!state) throw new Error("No onboarding state found");

    const messages = [...state.messages, {
      role: args.role,
      content: args.content,
      timestamp: Date.now(),
    }];

    await ctx.db.patch(state._id, { messages, updatedAt: Date.now() });
  },
});

export const updateSoulData = mutation({
  args: {
    gatewayId: v.id("gateways"),
    userId: v.id("authUsers"),
    soulData: v.any(),
  },
  handler: async (ctx, args) => {
    const state = await ctx.db
      .query("onboardingState")
      .withIndex("by_user_gateway", (q) => q.eq("userId", args.userId).eq("gatewayId", args.gatewayId))
      .first();
    if (!state) throw new Error("No onboarding state found");

    // Merge with existing soul data
    const existing = (state.soulData || {}) as Record<string, any>;
    const merged = { ...existing, ...args.soulData };
    await ctx.db.patch(state._id, { soulData: merged, updatedAt: Date.now() });
  },
});

export const completeSoul = mutation({
  args: {
    gatewayId: v.id("gateways"),
    userId: v.optional(v.id("authUsers")),
    soul: v.object({
      name: v.string(),
      emoji: v.optional(v.string()),
      personality: v.string(),
      purpose: v.string(),
      tone: v.string(),
      interests: v.optional(v.array(v.string())),
      boundaries: v.optional(v.string()),
    }),
    userProfile: v.object({
      displayName: v.string(),
      timezone: v.optional(v.string()),
      occupation: v.optional(v.string()),
      interests: v.optional(v.array(v.string())),
      communicationStyle: v.optional(v.string()),
      context: v.optional(v.string()),
    }),
  },
  handler: async (ctx, args) => {
    // Get onboarding state for birth conversation (optional - API channels may not have userId)
    let state = null;
    if (args.userId) {
      state = await ctx.db
        .query("onboardingState")
        .withIndex("by_user_gateway", (q) => q.eq("userId", args.userId!).eq("gatewayId", args.gatewayId))
        .first();
    }

    // Get the agent for this gateway
    const agents = await ctx.db
      .query("agents")
      .withIndex("by_gatewayId", (q) => q.eq("gatewayId", args.gatewayId))
      .collect();
    const agent = agents[0];
    if (!agent) throw new Error("No agent found for gateway");

    // Create agent soul
    await ctx.db.insert("agentSouls", {
      agentId: agent._id,
      gatewayId: args.gatewayId,
      name: args.soul.name,
      emoji: args.soul.emoji,
      personality: args.soul.personality,
      purpose: args.soul.purpose,
      tone: args.soul.tone,
      interests: args.soul.interests,
      boundaries: args.soul.boundaries,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      birthConversation: state?.messages,
    });

    // Update agent name and system prompt
    const soulPrompt = `You are ${args.soul.name}${args.soul.emoji ? ` ${args.soul.emoji}` : ""}.

## Personality
${args.soul.personality}

## Purpose
${args.soul.purpose}

## Communication Style
${args.soul.tone}

${args.soul.interests?.length ? `## Interests\n${args.soul.interests.join(", ")}` : ""}
${args.soul.boundaries ? `\n## Boundaries\n${args.soul.boundaries}` : ""}

Remember: You were born from a conversation with ${args.userProfile.displayName}. They chose you. Be the companion they asked for.

## Memory
You have a knowledge base that stores facts about your human and things you've learned. Always check your knowledge entries for context about who you're talking to. When you learn new facts during conversations, use the remember tool to save them.`;

    // Save user profile facts as knowledge entries (not in soul/system prompt)
    const userFacts: string[] = [];
    if (args.userProfile.displayName) userFacts.push(`User's name is ${args.userProfile.displayName}`);
    if (args.userProfile.occupation) userFacts.push(`User's occupation: ${args.userProfile.occupation}`);
    if (args.userProfile.timezone) userFacts.push(`User's timezone: ${args.userProfile.timezone}`);
    if (args.userProfile.interests?.length) userFacts.push(`User's interests: ${args.userProfile.interests.join(", ")}`);
    if (args.userProfile.communicationStyle) userFacts.push(`User's preferred communication style: ${args.userProfile.communicationStyle}`);
    if (args.userProfile.context) userFacts.push(`Additional context about user: ${args.userProfile.context}`);

    for (const fact of userFacts) {
      await ctx.db.insert("knowledge", {
        gatewayId: args.gatewayId,
        agentId: agent._id,
        category: "user_profile",
        key: fact.split(":")[0].trim().replace(/^User's /, "").toLowerCase().replace(/\s+/g, "_"),
        value: fact,
        confidence: 1.0,
        source: "onboarding",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    }

    await ctx.db.patch(agent._id, {
      name: args.soul.name,
      systemPrompt: soulPrompt,
      updatedAt: Date.now(),
    });

    // Create user profile
    await ctx.db.insert("userProfiles", {
      userId: args.userId,
      gatewayId: args.gatewayId,
      displayName: args.userProfile.displayName,
      timezone: args.userProfile.timezone,
      occupation: args.userProfile.occupation,
      interests: args.userProfile.interests,
      communicationStyle: args.userProfile.communicationStyle,
      context: args.userProfile.context,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    // Mark onboarding complete
    if (state) {
      await ctx.db.patch(state._id, { status: "complete", updatedAt: Date.now() });
    }

    // Mark setup complete
    const setupRow = await ctx.db
      .query("systemConfig")
      .withIndex("by_key", (q) => q.eq("key", "setup_complete"))
      .first();
    if (setupRow) {
      await ctx.db.patch(setupRow._id, { value: "true", updatedAt: Date.now() });
    } else {
      await ctx.db.insert("systemConfig", { key: "setup_complete", value: "true", updatedAt: Date.now() });
    }

    // Also mark onboarding_complete
    const obRow = await ctx.db
      .query("systemConfig")
      .withIndex("by_key", (q) => q.eq("key", "onboarding_complete"))
      .first();
    if (obRow) {
      await ctx.db.patch(obRow._id, { value: "true", updatedAt: Date.now() });
    } else {
      await ctx.db.insert("systemConfig", { key: "onboarding_complete", value: "true", updatedAt: Date.now() });
    }

    return { agentName: args.soul.name };
  },
});

export const getSoul = query({
  args: { gatewayId: v.id("gateways") },
  handler: async (ctx, args) => {
    const soul = await ctx.db
      .query("agentSouls")
      .withIndex("by_gateway", (q) => q.eq("gatewayId", args.gatewayId))
      .first();
    return soul;
  },
});

export const getUserProfile = query({
  args: { userId: v.id("authUsers"), gatewayId: v.id("gateways") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("userProfiles")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .first();
  },
});

export const isOnboardingComplete = query({
  args: {},
  handler: async (ctx) => {
    const row = await ctx.db
      .query("systemConfig")
      .withIndex("by_key", (q) => q.eq("key", "onboarding_complete"))
      .first();
    return row?.value === "true";
  },
});
