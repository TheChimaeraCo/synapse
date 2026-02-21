import { v } from "convex/values";
import { query, mutation, internalQuery } from "../_generated/server";
import { action } from "../_generated/server";
import { decodeConfigForRead, encodeConfigForStorage } from "../lib/configCrypto";

export const get = query({
  args: { key: v.string() },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("systemConfig")
      .withIndex("by_key", (q) => q.eq("key", args.key))
      .first();
    if (!row) return null;
    return await decodeConfigForRead(args.key, row.value);
  },
});

export const getInternal = internalQuery({
  args: { key: v.string() },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("systemConfig")
      .withIndex("by_key", (q) => q.eq("key", args.key))
      .first();
    if (!row) return null;
    return await decodeConfigForRead(args.key, row.value);
  },
});

export const set = mutation({
  args: { key: v.string(), value: v.string() },
  handler: async (ctx, args) => {
    const encodedValue = await encodeConfigForStorage(args.key, args.value);
    const existing = await ctx.db
      .query("systemConfig")
      .withIndex("by_key", (q) => q.eq("key", args.key))
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, {
        value: encodedValue,
        updatedAt: Date.now(),
      });
    } else {
      await ctx.db.insert("systemConfig", {
        key: args.key,
        value: encodedValue,
        updatedAt: Date.now(),
      });
    }
  },
});

export const getMultiple = query({
  args: { keys: v.array(v.string()) },
  handler: async (ctx, args) => {
    const result: Record<string, string> = {};
    for (const key of args.keys) {
      const row = await ctx.db
        .query("systemConfig")
        .withIndex("by_key", (q) => q.eq("key", key))
        .first();
      if (row) result[key] = await decodeConfigForRead(key, row.value);
    }
    return result;
  },
});

export const getAll = query({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("systemConfig").collect();
    const result: Record<string, string> = {};
    for (const row of rows) {
      result[row.key] = await decodeConfigForRead(row.key, row.value);
    }
    return result;
  },
});

export const getByPrefix = query({
  args: { prefix: v.string() },
  handler: async (ctx, args) => {
    const all = await ctx.db.query("systemConfig").collect();
    const result: Record<string, string> = {};
    for (const row of all) {
      if (row.key.startsWith(args.prefix)) {
        result[row.key] = await decodeConfigForRead(row.key, row.value);
      }
    }
    return result;
  },
});

export const isSetupComplete = query({
  args: {},
  handler: async (ctx) => {
    const row = await ctx.db
      .query("systemConfig")
      .withIndex("by_key", (q) => q.eq("key", "setup_complete"))
      .first();
    if (!row) return false;
    const value = await decodeConfigForRead("setup_complete", row.value);
    return value === "true";
  },
});

export const testAnthropicKey = action({
  args: { apiKey: v.string() },
  handler: async (_ctx, args) => {
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": args.apiKey,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: "claude-haiku-3-20250514",
          max_tokens: 10,
          messages: [{ role: "user", content: "Hi" }],
        }),
      });
      if (!res.ok) {
        const text = await res.text();
        return { valid: false, error: `API error ${res.status}: ${text}` };
      }
      return { valid: true };
    } catch (err: any) {
      return { valid: false, error: err.message || "Connection failed" };
    }
  },
});

export const testTelegramToken = action({
  args: { botToken: v.string() },
  handler: async (_ctx, args) => {
    try {
      const res = await fetch(
        `https://api.telegram.org/bot${args.botToken}/getMe`
      );
      const data = await res.json();
      if (!data.ok) {
        return { valid: false, error: data.description || "Invalid token" };
      }
      return { valid: true, botUsername: data.result.username };
    } catch (err: any) {
      return { valid: false, error: err.message || "Connection failed" };
    }
  },
});

export const registerTelegramWebhook = action({
  args: {
    botToken: v.string(),
    webhookUrl: v.string(),
    secret: v.string(),
  },
  handler: async (_ctx, args) => {
    try {
      const res = await fetch(
        `https://api.telegram.org/bot${args.botToken}/setWebhook`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            url: args.webhookUrl,
            secret_token: args.secret,
          }),
        }
      );
      const data = await res.json();
      if (!data.ok) {
        return { success: false, error: data.description || "Failed to set webhook" };
      }
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message || "Connection failed" };
    }
  },
});
