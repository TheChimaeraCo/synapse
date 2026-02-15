import { v } from "convex/values";
import { query, mutation } from "../_generated/server";

export const create = mutation({
  args: {
    name: v.string(),
    description: v.string(),
    status: v.optional(v.union(v.literal("active"), v.literal("paused"), v.literal("completed"), v.literal("archived"))),
    priority: v.optional(v.number()),
    gatewayId: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("projects", {
      name: args.name,
      description: args.description,
      status: args.status ?? "active",
      priority: args.priority ?? 3,
      gatewayId: args.gatewayId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  },
});

export const get = query({
  args: { id: v.id("projects") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

export const list = query({
  args: {
    gatewayId: v.string(),
    status: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const projects = await ctx.db
      .query("projects")
      .withIndex("by_gatewayId", (q) => q.eq("gatewayId", args.gatewayId))
      .collect();

    if (args.status) {
      return projects.filter((p) => p.status === args.status);
    }
    return projects;
  },
});

export const update = mutation({
  args: {
    id: v.id("projects"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    status: v.optional(v.union(v.literal("active"), v.literal("paused"), v.literal("completed"), v.literal("archived"))),
    priority: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { id, ...patch } = args;
    const cleaned: any = { updatedAt: Date.now() };
    for (const [k, val] of Object.entries(patch)) {
      if (val !== undefined) cleaned[k] = val;
    }
    await ctx.db.patch(id, cleaned);
  },
});

export const archive = mutation({
  args: { id: v.id("projects") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, { status: "archived", updatedAt: Date.now() });
  },
});

export const getWithTasks = query({
  args: { id: v.id("projects") },
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.id);
    if (!project) return null;

    const tasks = await ctx.db
      .query("tasks")
      .withIndex("by_projectId", (q) => q.eq("projectId", args.id))
      .collect();

    return { ...project, tasks };
  },
});

export const getStats = query({
  args: { gatewayId: v.string() },
  handler: async (ctx, args) => {
    const projects = await ctx.db
      .query("projects")
      .withIndex("by_gatewayId", (q) => q.eq("gatewayId", args.gatewayId))
      .collect();

    const stats = [];
    for (const project of projects) {
      const tasks = await ctx.db
        .query("tasks")
        .withIndex("by_projectId", (q) => q.eq("projectId", project._id))
        .collect();

      const counts = { todo: 0, in_progress: 0, blocked: 0, done: 0 };
      for (const t of tasks) {
        counts[t.status]++;
      }
      stats.push({ projectId: project._id, name: project.name, ...counts, total: tasks.length });
    }
    return stats;
  },
});

export const remove = mutation({
  args: { id: v.id("projects") },
  handler: async (ctx, args) => {
    // Delete all tasks first
    const tasks = await ctx.db
      .query("tasks")
      .withIndex("by_projectId", (q) => q.eq("projectId", args.id))
      .collect();
    for (const t of tasks) {
      await ctx.db.delete(t._id);
    }
    await ctx.db.delete(args.id);
  },
});

// --- Project Intelligence Functions ---

export const getWithDetails = query({
  args: { id: v.id("projects") },
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.id);
    if (!project) return null;

    const tasks = await ctx.db
      .query("tasks")
      .withIndex("by_projectId", (q) => q.eq("projectId", args.id))
      .collect();

    const conversations = await ctx.db
      .query("conversations")
      .withIndex("by_projectId", (q) => q.eq("projectId", args.id))
      .order("desc")
      .take(10);

    const workerAgents = await ctx.db
      .query("workerAgents")
      .withIndex("by_projectId", (q) => q.eq("projectId", args.id))
      .order("desc")
      .take(10);

    return { ...project, tasks, conversations, workerAgents };
  },
});

export const getContext = query({
  args: { id: v.id("projects") },
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.id);
    if (!project) return null;

    const tasks = await ctx.db
      .query("tasks")
      .withIndex("by_projectId", (q) => q.eq("projectId", args.id))
      .collect();

    const conversations = await ctx.db
      .query("conversations")
      .withIndex("by_projectId", (q) => q.eq("projectId", args.id))
      .order("desc")
      .take(5);

    const todoTasks = tasks.filter((t) => t.status === "todo");
    const inProgressTasks = tasks.filter((t) => t.status === "in_progress");
    const doneTasks = tasks.filter((t) => t.status === "done");
    const blockedTasks = tasks.filter((t) => t.status === "blocked");

    let context = `## Active Project: ${project.name}\n`;
    context += `Status: ${project.status} | Priority: P${project.priority}\n`;
    context += `Description: ${project.description}\n\n`;

    context += `### Task Progress: ${doneTasks.length}/${tasks.length} done\n`;
    if (inProgressTasks.length > 0) {
      context += `**In Progress:**\n${inProgressTasks.map((t) => `- ${t.title}`).join("\n")}\n`;
    }
    if (todoTasks.length > 0) {
      context += `**Todo:**\n${todoTasks.map((t) => `- ${t.title}`).join("\n")}\n`;
    }
    if (blockedTasks.length > 0) {
      context += `**Blocked:**\n${blockedTasks.map((t) => `- ${t.title}`).join("\n")}\n`;
    }

    if (conversations.length > 0) {
      const lastConvo = conversations[0];
      if (lastConvo.summary) {
        context += `\n### Last Conversation Summary:\n${lastConvo.summary}\n`;
      }
      const allDecisions = conversations.flatMap((c) => c.decisions || []);
      if (allDecisions.length > 0) {
        context += `\n### Recent Decisions:\n${allDecisions.slice(0, 5).map((d) => `- ${d.what}`).join("\n")}\n`;
      }
    }

    return context;
  },
});

export const linkConversation = mutation({
  args: {
    conversationId: v.id("conversations"),
    projectId: v.id("projects"),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.conversationId, { projectId: args.projectId });
    // Update project conversation count
    const convos = await ctx.db
      .query("conversations")
      .withIndex("by_projectId", (q) => q.eq("projectId", args.projectId))
      .collect();
    await ctx.db.patch(args.projectId, {
      conversationCount: convos.length,
      lastActiveAt: Date.now(),
      updatedAt: Date.now(),
    });
  },
});

export const linkWorkerAgent = mutation({
  args: {
    workerAgentId: v.id("workerAgents"),
    projectId: v.id("projects"),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.workerAgentId, { projectId: args.projectId });
    await ctx.db.patch(args.projectId, {
      lastActiveAt: Date.now(),
      updatedAt: Date.now(),
    });
  },
});

export const updateActivity = mutation({
  args: { id: v.id("projects") },
  handler: async (ctx, args) => {
    const tasks = await ctx.db
      .query("tasks")
      .withIndex("by_projectId", (q) => q.eq("projectId", args.id))
      .collect();
    const activeTasks = tasks.filter((t) => t.status === "todo" || t.status === "in_progress").length;
    await ctx.db.patch(args.id, {
      lastActiveAt: Date.now(),
      activeTaskCount: activeTasks,
      updatedAt: Date.now(),
    });
  },
});

export const search = query({
  args: {
    gatewayId: v.string(),
    query: v.string(),
  },
  handler: async (ctx, args) => {
    const projects = await ctx.db
      .query("projects")
      .withIndex("by_gatewayId", (q) => q.eq("gatewayId", args.gatewayId))
      .collect();

    const words = args.query.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
    if (words.length === 0) return projects;

    return projects.filter((p) => {
      const text = `${p.name} ${p.description}`.toLowerCase();
      return words.some((w) => text.includes(w));
    });
  },
});

export const findByName = query({
  args: {
    gatewayId: v.string(),
    name: v.string(),
  },
  handler: async (ctx, args) => {
    const projects = await ctx.db
      .query("projects")
      .withIndex("by_gatewayId", (q) => q.eq("gatewayId", args.gatewayId))
      .collect();

    const lower = args.name.toLowerCase();
    return projects.find((p) => p.name.toLowerCase() === lower || p.name.toLowerCase().includes(lower)) || null;
  },
});
