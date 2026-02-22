import { NextRequest, NextResponse } from "next/server";
import { getGatewayContext, handleGatewayError } from "@/lib/gateway-context";
import { getConvexClient } from "@/lib/convex";
import { api } from "@/convex/_generated/api";
import { DEFAULT_ROUTING } from "@/lib/modelRouter";
import {
  AI_CAPABILITY_ROUTES_KEY,
  LEGACY_MODEL_ROUTING_KEY,
  TASK_CAPABILITIES,
  buildLegacyRoutingFromCapabilities,
  parseCapabilityRoutes,
  serializeCapabilityRoutes,
  type CapabilityRoutes,
  type RouteTarget,
} from "@/lib/aiRoutingConfig";
import type { Id } from "@/convex/_generated/dataModel";

function clean(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

function normalizeBodyToRoutes(body: any): CapabilityRoutes {
  if (!body || typeof body !== "object") return {};
  const routes: CapabilityRoutes = {};

  const maybeLegacy = Object.values(body).every((v) => typeof v === "string" || !v);
  if (maybeLegacy) {
    for (const key of TASK_CAPABILITIES) {
      const model = clean(body[key]);
      if (model) routes[key] = { model };
    }
    return routes;
  }

  for (const [key, value] of Object.entries(body)) {
    if (typeof value === "string") {
      const model = clean(value);
      if (model) routes[key] = { model };
      continue;
    }
    if (!value || typeof value !== "object") continue;
    const routeValue = value as Record<string, unknown>;
    const route: RouteTarget = {};
    const providerProfileId = clean(routeValue.providerProfileId);
    const provider = clean(routeValue.provider);
    const model = clean(routeValue.model);
    if (providerProfileId) route.providerProfileId = providerProfileId;
    if (provider) route.provider = provider;
    if (model) route.model = model;
    if (Object.keys(route).length > 0) routes[key] = route;
  }

  return routes;
}

function withDefaults(routes: CapabilityRoutes): CapabilityRoutes {
  const out: CapabilityRoutes = { ...routes };
  if (!out.chat?.model) out.chat = { ...(out.chat || {}), model: DEFAULT_ROUTING.chat };
  if (!out.tool_use?.model) out.tool_use = { ...(out.tool_use || {}), model: DEFAULT_ROUTING.tool_use };
  if (!out.summary?.model) out.summary = { ...(out.summary || {}), model: DEFAULT_ROUTING.summary };
  if (!out.code?.model) out.code = { ...(out.code || {}), model: DEFAULT_ROUTING.code };
  if (!out.analysis?.model) out.analysis = { ...(out.analysis || {}), model: DEFAULT_ROUTING.analysis };
  if (!out.file_read?.model) out.file_read = { ...(out.file_read || {}), model: DEFAULT_ROUTING.analysis };
  if (!out.pdf_read?.model) out.pdf_read = { ...(out.pdf_read || {}), model: DEFAULT_ROUTING.analysis };
  if (!out.image_read?.model) out.image_read = { ...(out.image_read || {}), model: DEFAULT_ROUTING.analysis };
  if (!out.excel_read?.model) out.excel_read = { ...(out.excel_read || {}), model: DEFAULT_ROUTING.analysis };
  return out;
}

async function getRouteConfig(
  gatewayId: Id<"gateways">,
): Promise<{ routesRaw?: string | null; legacyRaw?: string | null }> {
  const convex = getConvexClient();
  const [routesRes, legacyRes] = await Promise.all([
    convex.query(api.functions.gatewayConfig.getWithInheritance, {
      gatewayId,
      key: AI_CAPABILITY_ROUTES_KEY,
    }),
    convex.query(api.functions.gatewayConfig.getWithInheritance, {
      gatewayId,
      key: LEGACY_MODEL_ROUTING_KEY,
    }),
  ]);
  return {
    routesRaw: routesRes?.value || null,
    legacyRaw: legacyRes?.value || null,
  };
}

export async function GET(req: NextRequest) {
  try {
    const { gatewayId } = await getGatewayContext(req);
    const { routesRaw, legacyRaw } = await getRouteConfig(gatewayId as Id<"gateways">);
    const routes = withDefaults(parseCapabilityRoutes(routesRaw, legacyRaw));
    return NextResponse.json(routes);
  } catch (err) {
    try {
      const { auth } = await import("@/auth");
      const session = await auth();
      if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      const convex = getConvexClient();
      const [routesRaw, legacyRaw] = await Promise.all([
        convex.query(api.functions.config.get, { key: AI_CAPABILITY_ROUTES_KEY }),
        convex.query(api.functions.config.get, { key: LEGACY_MODEL_ROUTING_KEY }),
      ]);
      const routes = withDefaults(parseCapabilityRoutes(routesRaw, legacyRaw));
      return NextResponse.json(routes);
    } catch {
      return handleGatewayError(err);
    }
  }
}

export async function PUT(req: NextRequest) {
  try {
    const { gatewayId } = await getGatewayContext(req);
    const convex = getConvexClient();
    const body = await req.json();
    const routes = withDefaults(normalizeBodyToRoutes(body));
    const legacyRouting = buildLegacyRoutingFromCapabilities(routes);

    await convex.mutation(api.functions.gatewayConfig.set, {
      gatewayId: gatewayId as Id<"gateways">,
      key: AI_CAPABILITY_ROUTES_KEY,
      value: serializeCapabilityRoutes(routes),
    });
    await convex.mutation(api.functions.gatewayConfig.set, {
      gatewayId: gatewayId as Id<"gateways">,
      key: LEGACY_MODEL_ROUTING_KEY,
      value: JSON.stringify(legacyRouting),
    });

    return NextResponse.json(routes);
  } catch (err) {
    try {
      const { auth } = await import("@/auth");
      const session = await auth();
      if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      const convex = getConvexClient();
      const body = await req.json();
      const routes = withDefaults(normalizeBodyToRoutes(body));
      const legacyRouting = buildLegacyRoutingFromCapabilities(routes);
      await convex.mutation(api.functions.config.set, {
        key: AI_CAPABILITY_ROUTES_KEY,
        value: serializeCapabilityRoutes(routes),
      });
      await convex.mutation(api.functions.config.set, {
        key: LEGACY_MODEL_ROUTING_KEY,
        value: JSON.stringify(legacyRouting),
      });
      return NextResponse.json(routes);
    } catch {
      return handleGatewayError(err);
    }
  }
}
