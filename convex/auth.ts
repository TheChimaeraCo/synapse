import { v } from "convex/values";
import { internalQuery, internalMutation } from "./_generated/server";

export const getUserByEmail = internalQuery({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("authUsers")
      .withIndex("by_email", (q) => q.eq("email", args.email))
      .first();
  },
});

export const createUser = internalMutation({
  args: {
    email: v.string(),
    name: v.optional(v.string()),
    passwordHash: v.optional(v.string()),
    role: v.union(v.literal("owner"), v.literal("admin"), v.literal("user")),
    gatewayId: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("authUsers", {
      email: args.email,
      name: args.name,
      passwordHash: args.passwordHash,
      role: args.role,
      gatewayId: args.gatewayId,
    });
  },
});

export const getSession = internalQuery({
  args: { sessionToken: v.string() },
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query("authSessions")
      .withIndex("by_sessionToken", (q) => q.eq("sessionToken", args.sessionToken))
      .first();
    if (!session) return null;
    if (session.expires < Date.now()) return null;
    const user = await ctx.db.get(session.userId);
    if (!user) return null;
    return { session, user };
  },
});

export const createSession = internalMutation({
  args: {
    userId: v.id("authUsers"),
    sessionToken: v.string(),
    expires: v.number(),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) throw new Error("User not found");
    return await ctx.db.insert("authSessions", {
      userId: args.userId,
      sessionToken: args.sessionToken,
      expires: args.expires,
      gatewayId: user.gatewayId,
    });
  },
});

export const deleteSession = internalMutation({
  args: { sessionToken: v.string() },
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query("authSessions")
      .withIndex("by_sessionToken", (q) => q.eq("sessionToken", args.sessionToken))
      .first();
    if (session) await ctx.db.delete(session._id);
  },
});
