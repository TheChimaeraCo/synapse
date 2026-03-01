import { mutation, query } from "../_generated/server";
import { v } from "convex/values";

const integrationType = v.union(v.literal("rest"), v.literal("mcp"));
const authType = v.union(
  v.literal("none"),
  v.literal("bearer"),
  v.literal("header"),
  v.literal("query"),
  v.literal("basic"),
);
const healthStatus = v.union(v.literal("healthy"), v.literal("degraded"), v.literal("down"));

export const list = query({
  args: { gatewayId: v.id("gateways") },
  handler: async (ctx, { gatewayId }) => {
    const [integrations, endpoints] = await Promise.all([
      ctx.db
        .query("apiIntegrations")
        .withIndex("by_gatewayId", (q) => q.eq("gatewayId", gatewayId))
        .collect(),
      ctx.db
        .query("apiIntegrationEndpoints")
        .withIndex("by_gatewayId", (q) => q.eq("gatewayId", gatewayId))
        .collect(),
    ]);

    const endpointsByIntegration = new Map<string, any[]>();
    for (const endpoint of endpoints) {
      const key = String(endpoint.integrationId);
      const list = endpointsByIntegration.get(key) || [];
      list.push(endpoint);
      endpointsByIntegration.set(key, list);
    }

    return integrations.map((integration) => ({
      ...integration,
      endpoints: (endpointsByIntegration.get(String(integration._id)) || []).sort((a, b) =>
        a.name.localeCompare(b.name),
      ),
    }));
  },
});

export const getByToolName = query({
  args: { gatewayId: v.id("gateways"), toolName: v.string() },
  handler: async (ctx, { gatewayId, toolName }) => {
    const endpoint = await ctx.db
      .query("apiIntegrationEndpoints")
      .withIndex("by_gateway_toolName", (q) => q.eq("gatewayId", gatewayId).eq("toolName", toolName))
      .first();
    if (!endpoint) return null;

    const integration = await ctx.db.get(endpoint.integrationId);
    if (!integration || integration.gatewayId !== gatewayId) return null;

    return { integration, endpoint };
  },
});

export const getBySlugs = query({
  args: {
    gatewayId: v.id("gateways"),
    integrationSlug: v.string(),
    endpointSlug: v.string(),
  },
  handler: async (ctx, { gatewayId, integrationSlug, endpointSlug }) => {
    const integration = await ctx.db
      .query("apiIntegrations")
      .withIndex("by_gateway_slug", (q) => q.eq("gatewayId", gatewayId).eq("slug", integrationSlug))
      .first();
    if (!integration) return null;

    const endpoints = await ctx.db
      .query("apiIntegrationEndpoints")
      .withIndex("by_integrationId", (q) => q.eq("integrationId", integration._id))
      .collect();
    const endpoint = endpoints.find((row) => row.slug === endpointSlug) || null;
    if (!endpoint) return null;
    return { integration, endpoint };
  },
});

export const createIntegration = mutation({
  args: {
    gatewayId: v.id("gateways"),
    name: v.string(),
    slug: v.string(),
    type: integrationType,
    baseUrl: v.string(),
    authType,
    authConfig: v.optional(v.any()),
    healthPath: v.optional(v.string()),
    enabled: v.boolean(),
    allowPrivateNetwork: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    return await ctx.db.insert("apiIntegrations", {
      ...args,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const updateIntegration = mutation({
  args: {
    id: v.id("apiIntegrations"),
    name: v.optional(v.string()),
    slug: v.optional(v.string()),
    type: v.optional(integrationType),
    baseUrl: v.optional(v.string()),
    authType: v.optional(authType),
    authConfig: v.optional(v.any()),
    healthPath: v.optional(v.string()),
    enabled: v.optional(v.boolean()),
    allowPrivateNetwork: v.optional(v.boolean()),
  },
  handler: async (ctx, { id, ...updates }) => {
    const filtered = Object.fromEntries(Object.entries(updates).filter(([, v]) => v !== undefined));
    await ctx.db.patch(id, { ...filtered, updatedAt: Date.now() });
  },
});

export const removeIntegration = mutation({
  args: { id: v.id("apiIntegrations") },
  handler: async (ctx, { id }) => {
    const integration = await ctx.db.get(id);
    if (!integration) return;

    const endpoints = await ctx.db
      .query("apiIntegrationEndpoints")
      .withIndex("by_integrationId", (q) => q.eq("integrationId", id))
      .collect();
    for (const endpoint of endpoints) {
      await ctx.db.delete(endpoint._id);
    }
    await ctx.db.delete(id);
  },
});

export const createEndpoint = mutation({
  args: {
    gatewayId: v.id("gateways"),
    integrationId: v.id("apiIntegrations"),
    name: v.string(),
    slug: v.string(),
    toolName: v.string(),
    method: v.string(),
    path: v.string(),
    description: v.optional(v.string()),
    headers: v.optional(v.any()),
    queryTemplate: v.optional(v.any()),
    bodyTemplate: v.optional(v.any()),
    argsSchema: v.optional(v.any()),
    timeoutMs: v.optional(v.number()),
    enabled: v.boolean(),
    exposeAsTool: v.boolean(),
    requiresApproval: v.boolean(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    return await ctx.db.insert("apiIntegrationEndpoints", {
      ...args,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const updateEndpoint = mutation({
  args: {
    id: v.id("apiIntegrationEndpoints"),
    name: v.optional(v.string()),
    slug: v.optional(v.string()),
    toolName: v.optional(v.string()),
    method: v.optional(v.string()),
    path: v.optional(v.string()),
    description: v.optional(v.string()),
    headers: v.optional(v.any()),
    queryTemplate: v.optional(v.any()),
    bodyTemplate: v.optional(v.any()),
    argsSchema: v.optional(v.any()),
    timeoutMs: v.optional(v.number()),
    enabled: v.optional(v.boolean()),
    exposeAsTool: v.optional(v.boolean()),
    requiresApproval: v.optional(v.boolean()),
  },
  handler: async (ctx, { id, ...updates }) => {
    const filtered = Object.fromEntries(Object.entries(updates).filter(([, v]) => v !== undefined));
    await ctx.db.patch(id, { ...filtered, updatedAt: Date.now() });
  },
});

export const removeEndpoint = mutation({
  args: { id: v.id("apiIntegrationEndpoints") },
  handler: async (ctx, { id }) => {
    await ctx.db.delete(id);
  },
});

export const setHealth = mutation({
  args: {
    id: v.id("apiIntegrations"),
    status: healthStatus,
    statusCode: v.optional(v.number()),
    error: v.optional(v.string()),
  },
  handler: async (ctx, { id, status, statusCode, error }) => {
    await ctx.db.patch(id, {
      lastHealthStatus: status,
      lastHealthCode: statusCode,
      lastHealthError: error,
      lastHealthAt: Date.now(),
      updatedAt: Date.now(),
    });
  },
});
