import { v } from "convex/values";
import { query, mutation } from "../_generated/server";

export const list = query({
  args: { agentId: v.id("agents") },
  handler: async (ctx, args) => {
    const entries = await ctx.db
      .query("soulEvolution")
      .withIndex("by_agent", (q) => q.eq("agentId", args.agentId))
      .collect();
    return entries.sort((a, b) => b.confidence - a.confidence);
  },
});

export const getForPrompt = query({
  args: { agentId: v.id("agents"), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const max = args.limit ?? 20;
    const entries = await ctx.db
      .query("soulEvolution")
      .withIndex("by_agent", (q) => q.eq("agentId", args.agentId))
      .collect();
    return entries
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, max);
  },
});

export const upsert = mutation({
  args: {
    agentId: v.id("agents"),
    gatewayId: v.id("gateways"),
    category: v.string(),
    insight: v.string(),
    sourceConversationId: v.optional(v.id("conversations")),
  },
  handler: async (ctx, args) => {
    // Look for similar existing insight in same category
    const existing = await ctx.db
      .query("soulEvolution")
      .withIndex("by_agent_category", (q) =>
        q.eq("agentId", args.agentId).eq("category", args.category)
      )
      .collect();

    // Simple similarity: check if insight text overlaps significantly
    const normalise = (s: string) => s.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim();
    const newNorm = normalise(args.insight);
    const newWords = new Set(newNorm.split(/\s+/).filter((w) => w.length > 3));

    for (const entry of existing) {
      const entryNorm = normalise(entry.insight);
      const entryWords = new Set(entryNorm.split(/\s+/).filter((w) => w.length > 3));
      if (entryWords.size === 0 || newWords.size === 0) continue;
      const overlap = [...newWords].filter((w) => entryWords.has(w)).length;
      const similarity = overlap / Math.max(newWords.size, entryWords.size);
      if (similarity > 0.5) {
        // Reinforce existing insight
        const newConfidence = Math.min(1.0, entry.confidence + 0.1);
        await ctx.db.patch(entry._id, {
          confidence: newConfidence,
          reinforcementCount: entry.reinforcementCount + 1,
          updatedAt: Date.now(),
          // Update insight text if new one is longer/better
          ...(args.insight.length > entry.insight.length ? { insight: args.insight } : {}),
        });
        return entry._id;
      }
    }

    // No similar entry found - create new
    return await ctx.db.insert("soulEvolution", {
      agentId: args.agentId,
      gatewayId: args.gatewayId,
      category: args.category,
      insight: args.insight,
      confidence: 0.3,
      sourceConversationId: args.sourceConversationId,
      reinforcementCount: 1,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  },
});

export const remove = mutation({
  args: { id: v.id("soulEvolution") },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.id);
  },
});

export const reflect = mutation({
  args: {
    agentId: v.id("agents"),
    gatewayId: v.id("gateways"),
    insights: v.array(v.object({
      category: v.string(),
      insight: v.string(),
    })),
    sourceConversationId: v.optional(v.id("conversations")),
  },
  handler: async (ctx, args) => {
    const validCategories = new Set([
      "communication_pattern",
      "relationship_dynamic",
      "preference",
      "emotional_intelligence",
      "inside_joke",
      "behavioral_adaptation",
    ]);

    let stored = 0;
    for (const item of args.insights) {
      if (!validCategories.has(item.category)) continue;
      if (!item.insight || item.insight.trim().length < 5) continue;

      // Look for similar existing insight in same category
      const existing = await ctx.db
        .query("soulEvolution")
        .withIndex("by_agent_category", (q) =>
          q.eq("agentId", args.agentId).eq("category", item.category)
        )
        .collect();

      const normalise = (s: string) => s.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim();
      const newNorm = normalise(item.insight);
      const newWords = new Set(newNorm.split(/\s+/).filter((w) => w.length > 3));

      let matched = false;
      for (const entry of existing) {
        const entryNorm = normalise(entry.insight);
        const entryWords = new Set(entryNorm.split(/\s+/).filter((w) => w.length > 3));
        if (entryWords.size === 0 || newWords.size === 0) continue;
        const overlap = [...newWords].filter((w) => entryWords.has(w)).length;
        const similarity = overlap / Math.max(newWords.size, entryWords.size);
        if (similarity > 0.5) {
          await ctx.db.patch(entry._id, {
            confidence: Math.min(1.0, entry.confidence + 0.1),
            reinforcementCount: entry.reinforcementCount + 1,
            updatedAt: Date.now(),
            ...(item.insight.length > entry.insight.length ? { insight: item.insight } : {}),
          });
          matched = true;
          break;
        }
      }

      if (!matched) {
        await ctx.db.insert("soulEvolution", {
          agentId: args.agentId,
          gatewayId: args.gatewayId,
          category: item.category,
          insight: item.insight.trim(),
          confidence: 0.3,
          sourceConversationId: args.sourceConversationId,
          reinforcementCount: 1,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
      }
      stored++;
    }
    return { stored };
  },
});
