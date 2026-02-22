import { v } from "convex/values";
import { query, mutation } from "../_generated/server";
import { decodeConfigForRead, encodeConfigForStorage } from "../lib/configCrypto";

export const get = query({
  args: { gatewayId: v.id("gateways"), key: v.string() },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("gatewayConfig")
      .withIndex("by_gateway_key", (q) => q.eq("gatewayId", args.gatewayId).eq("key", args.key))
      .first();
    if (!row) return null;
    return await decodeConfigForRead(args.key, row.value);
  },
});

export const set = mutation({
  args: { gatewayId: v.id("gateways"), key: v.string(), value: v.string() },
  handler: async (ctx, args) => {
    const encodedValue = await encodeConfigForStorage(args.key, args.value);
    const existing = await ctx.db
      .query("gatewayConfig")
      .withIndex("by_gateway_key", (q) => q.eq("gatewayId", args.gatewayId).eq("key", args.key))
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, { value: encodedValue, updatedAt: Date.now() });
    } else {
      await ctx.db.insert("gatewayConfig", {
        gatewayId: args.gatewayId,
        key: args.key,
        value: encodedValue,
        updatedAt: Date.now(),
      });
    }
  },
});

export const getMultiple = query({
  args: { gatewayId: v.id("gateways"), keys: v.array(v.string()) },
  handler: async (ctx, args) => {
    const result: Record<string, string> = {};
    for (const key of args.keys) {
      const row = await ctx.db
        .query("gatewayConfig")
        .withIndex("by_gateway_key", (q) => q.eq("gatewayId", args.gatewayId).eq("key", key))
        .first();
      if (row) result[key] = await decodeConfigForRead(key, row.value);
    }
    return result;
  },
});

export const getAll = query({
  args: { gatewayId: v.id("gateways") },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("gatewayConfig")
      .withIndex("by_gatewayId", (q) => q.eq("gatewayId", args.gatewayId))
      .collect();
    const result: Record<string, string> = {};
    for (const row of rows) {
      result[row.key] = await decodeConfigForRead(row.key, row.value);
    }

    // Merge inherited config from master gateway without overwriting local values.
    const allGateways = await ctx.db.query("gateways").collect();
    const master = allGateways.find((g) => g.isMaster === true);
    if (master && master._id !== args.gatewayId) {
      const masterRows = await ctx.db
        .query("gatewayConfig")
        .withIndex("by_gatewayId", (q) => q.eq("gatewayId", master._id))
        .collect();
      for (const row of masterRows) {
        if (result[row.key] !== undefined) continue;
        result[row.key] = await decodeConfigForRead(row.key, row.value);
      }
    }

    return result;
  },
});

export const remove = mutation({
  args: { gatewayId: v.id("gateways"), key: v.string() },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("gatewayConfig")
      .withIndex("by_gateway_key", (q) => q.eq("gatewayId", args.gatewayId).eq("key", args.key))
      .first();
    if (row) await ctx.db.delete(row._id);
  },
});

export const getWithInheritance = query({
  args: { gatewayId: v.id("gateways"), key: v.string() },
  handler: async (ctx, args) => {
    // Check gateway first
    const row = await ctx.db
      .query("gatewayConfig")
      .withIndex("by_gateway_key", (q) => q.eq("gatewayId", args.gatewayId).eq("key", args.key))
      .first();
    if (row) {
      return {
        value: await decodeConfigForRead(args.key, row.value),
        inherited: false,
      };
    }

    // Fall back to master gateway
    const allGateways = await ctx.db.query("gateways").collect();
    const master = allGateways.find((g) => g.isMaster === true);
    if (!master || master._id === args.gatewayId) return null;

    const masterRow = await ctx.db
      .query("gatewayConfig")
      .withIndex("by_gateway_key", (q) => q.eq("gatewayId", master._id).eq("key", args.key))
      .first();
    if (masterRow) {
      return {
        value: await decodeConfigForRead(args.key, masterRow.value),
        inherited: true,
      };
    }
    return null;
  },
});
