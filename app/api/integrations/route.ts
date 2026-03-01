import { NextRequest, NextResponse } from "next/server";
import { getGatewayContext, GatewayError, handleGatewayError } from "@/lib/gateway-context";
import { convexClient } from "@/lib/convex";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  buildToolName,
  checkIntegrationHealth,
  discoverIntegrationDetails,
  slugify,
  syncIntegrationTools,
} from "@/lib/integrationRuntime";

function requireToolManager(role: string) {
  if (role !== "owner" && role !== "admin") {
    throw new GatewayError(403, "Owner/admin role required");
  }
}

async function setSecret(gatewayId: Id<"gateways">, integrationId: Id<"apiIntegrations">, key: string, value?: string) {
  const cfgKey = `integration.${integrationId}.secret.${key}`;
  if (value && value.trim()) {
    await convexClient.mutation(api.functions.gatewayConfig.set, {
      gatewayId,
      key: cfgKey,
      value: value.trim(),
    });
  } else {
    await convexClient.mutation(api.functions.gatewayConfig.remove, { gatewayId, key: cfgKey });
  }
}

async function getSecretFlag(gatewayId: Id<"gateways">, integrationId: Id<"apiIntegrations">, key: string) {
  const cfgKey = `integration.${integrationId}.secret.${key}`;
  const row = await convexClient.query(api.functions.gatewayConfig.getWithInheritance, {
    gatewayId,
    key: cfgKey,
  });
  return Boolean(row?.value);
}

function normalizeMethod(method: string | undefined): string {
  const upper = String(method || "GET").trim().toUpperCase();
  if (!upper) return "GET";
  return upper;
}

function normalizeIntegrationType(value: any): "rest" | "mcp" {
  return value === "mcp" ? "mcp" : "rest";
}

function normalizeAuthType(value: any): "none" | "bearer" | "header" | "query" | "basic" {
  if (value === "bearer" || value === "header" || value === "query" || value === "basic") return value;
  return "none";
}

function sanitizePath(path: string | undefined): string {
  const value = String(path || "/").trim();
  if (!value) return "/";
  return value.startsWith("/") ? value : `/${value}`;
}

function ensureUniqueSlug(base: string, used: Set<string>): string {
  let candidate = slugify(base);
  if (!used.has(candidate)) return candidate;
  let i = 2;
  while (used.has(`${candidate}-${i}`)) i += 1;
  return `${candidate}-${i}`;
}

export async function GET(req: NextRequest) {
  try {
    const { gatewayId } = await getGatewayContext(req);
    const rows = await convexClient.query(api.functions.integrations.list, { gatewayId: gatewayId as Id<"gateways"> });
    const withSecretFlags = await Promise.all(
      rows.map(async (integration: any) => {
        const hasToken = await getSecretFlag(gatewayId as Id<"gateways">, integration._id, "token");
        const hasValue = await getSecretFlag(gatewayId as Id<"gateways">, integration._id, "value");
        const hasPassword = await getSecretFlag(gatewayId as Id<"gateways">, integration._id, "password");
        return {
          ...integration,
          secretStatus: {
            hasToken,
            hasValue,
            hasPassword,
          },
        };
      }),
    );
    return NextResponse.json({ integrations: withSecretFlags });
  } catch (err) {
    return handleGatewayError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const { gatewayId, role } = await getGatewayContext(req);
    requireToolManager(role);
    const body = await req.json();
    const action = String(body.action || "");

    if (action === "sync") {
      await syncIntegrationTools(gatewayId as Id<"gateways">, body.integrationId as Id<"apiIntegrations"> | undefined);
      return NextResponse.json({ ok: true });
    }

    if (action === "healthCheck") {
      const integrationId = body.integrationId as Id<"apiIntegrations">;
      if (!integrationId) return NextResponse.json({ error: "integrationId is required" }, { status: 400 });
      const rows = await convexClient.query(api.functions.integrations.list, { gatewayId: gatewayId as Id<"gateways"> });
      const integration = rows.find((row: any) => String(row._id) === String(integrationId));
      if (!integration) return NextResponse.json({ error: "Integration not found" }, { status: 404 });
      const health = await checkIntegrationHealth({
        gatewayId: gatewayId as Id<"gateways">,
        integration,
      });
      await convexClient.mutation(api.functions.integrations.setHealth, {
        id: integrationId,
        status: health.status,
        ...(health.statusCode !== undefined ? { statusCode: health.statusCode } : {}),
        ...(health.error ? { error: health.error } : {}),
      });
      return NextResponse.json({ ok: true, health });
    }

    if (action === "discoverEndpoints") {
      const discovered = await discoverIntegrationDetails({
        baseUrl: body.baseUrl ? String(body.baseUrl) : undefined,
        docsUrl: body.docsUrl ? String(body.docsUrl) : undefined,
        docsText: body.docsText ? String(body.docsText) : undefined,
        gatewayId: gatewayId as Id<"gateways">,
        aiAssist: body.aiAssist !== false,
        allowPrivateNetwork: Boolean(body.allowPrivateNetwork),
        maxEndpoints: body.maxEndpoints ? Number(body.maxEndpoints) : 40,
      });
      return NextResponse.json({
        ok: true,
        endpoints: discovered.endpoints,
        autofill: discovered.autofill || null,
        notes: discovered.notes || [],
      });
    }

    if (action === "createIntegration") {
      const rows = await convexClient.query(api.functions.integrations.list, { gatewayId: gatewayId as Id<"gateways"> });
      const used = new Set(rows.map((row: any) => String(row.slug)));

      const integrationName = String(body.integration?.name || "").trim();
      const proposedSlug = String(body.integration?.slug || integrationName);
      if (!integrationName) {
        return NextResponse.json({ error: "integration.name is required" }, { status: 400 });
      }

      const slug = ensureUniqueSlug(proposedSlug, used);
      const id = await convexClient.mutation(api.functions.integrations.createIntegration, {
        gatewayId: gatewayId as Id<"gateways">,
        name: integrationName,
        slug,
        type: normalizeIntegrationType(body.integration?.type),
        baseUrl: String(body.integration?.baseUrl || "").trim(),
        authType: normalizeAuthType(body.integration?.authType),
        authConfig: body.integration?.authConfig,
        healthPath: body.integration?.healthPath ? String(body.integration.healthPath) : undefined,
        enabled: body.integration?.enabled !== false,
        allowPrivateNetwork: Boolean(body.integration?.allowPrivateNetwork),
      });

      const secrets = body.secrets || {};
      await setSecret(gatewayId as Id<"gateways">, id, "token", secrets.token);
      await setSecret(gatewayId as Id<"gateways">, id, "value", secrets.value);
      await setSecret(gatewayId as Id<"gateways">, id, "password", secrets.password);

      const endpoints = Array.isArray(body.endpoints) ? body.endpoints : [];
      const endpointSlugSet = new Set<string>();
      for (const endpointInput of endpoints) {
        const endpointName = String(endpointInput?.name || "").trim();
        if (!endpointName) continue;
        const endpointSlug = ensureUniqueSlug(String(endpointInput?.slug || endpointName), endpointSlugSet);
        endpointSlugSet.add(endpointSlug);
        const toolName = buildToolName(slug, endpointSlug);

        await convexClient.mutation(api.functions.integrations.createEndpoint, {
          gatewayId: gatewayId as Id<"gateways">,
          integrationId: id,
          name: endpointName,
          slug: endpointSlug,
          toolName,
          method: normalizeMethod(endpointInput.method),
          path: sanitizePath(endpointInput.path),
          description: endpointInput.description ? String(endpointInput.description) : undefined,
          headers: endpointInput.headers,
          queryTemplate: endpointInput.queryTemplate,
          bodyTemplate: endpointInput.bodyTemplate,
          argsSchema: endpointInput.argsSchema,
          timeoutMs: endpointInput.timeoutMs ? Number(endpointInput.timeoutMs) : undefined,
          enabled: endpointInput.enabled !== false,
          exposeAsTool: endpointInput.exposeAsTool !== false,
          requiresApproval: Boolean(endpointInput.requiresApproval),
        });
      }

      await syncIntegrationTools(gatewayId as Id<"gateways">, id);
      return NextResponse.json({ ok: true, id, slug });
    }

    if (action === "createEndpoint") {
      const integrationId = body.integrationId as Id<"apiIntegrations">;
      if (!integrationId) return NextResponse.json({ error: "integrationId is required" }, { status: 400 });

      const rows = await convexClient.query(api.functions.integrations.list, { gatewayId: gatewayId as Id<"gateways"> });
      const integration = rows.find((row: any) => String(row._id) === String(integrationId));
      if (!integration) return NextResponse.json({ error: "Integration not found" }, { status: 404 });

      const endpointName = String(body.endpoint?.name || "").trim();
      if (!endpointName) return NextResponse.json({ error: "endpoint.name is required" }, { status: 400 });
        const used = new Set<string>((integration.endpoints || []).map((ep: any) => String(ep.slug)));
      const endpointSlug = ensureUniqueSlug(String(body.endpoint?.slug || endpointName), used);
      const toolName = buildToolName(integration.slug, endpointSlug);

      const endpointId = await convexClient.mutation(api.functions.integrations.createEndpoint, {
        gatewayId: gatewayId as Id<"gateways">,
        integrationId,
        name: endpointName,
        slug: endpointSlug,
        toolName,
        method: normalizeMethod(body.endpoint?.method),
        path: sanitizePath(body.endpoint?.path),
        description: body.endpoint?.description ? String(body.endpoint.description) : undefined,
        headers: body.endpoint?.headers,
        queryTemplate: body.endpoint?.queryTemplate,
        bodyTemplate: body.endpoint?.bodyTemplate,
        argsSchema: body.endpoint?.argsSchema,
        timeoutMs: body.endpoint?.timeoutMs ? Number(body.endpoint.timeoutMs) : undefined,
        enabled: body.endpoint?.enabled !== false,
        exposeAsTool: body.endpoint?.exposeAsTool !== false,
        requiresApproval: Boolean(body.endpoint?.requiresApproval),
      });

      await syncIntegrationTools(gatewayId as Id<"gateways">, integrationId);
      return NextResponse.json({ ok: true, id: endpointId, toolName });
    }

    return NextResponse.json({ error: "Unsupported action" }, { status: 400 });
  } catch (err) {
    return handleGatewayError(err);
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const { gatewayId, role } = await getGatewayContext(req);
    requireToolManager(role);
    const body = await req.json();
    const action = String(body.action || "");

    if (action === "updateIntegration") {
      const id = body.id as Id<"apiIntegrations">;
      if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

      const rows = await convexClient.query(api.functions.integrations.list, { gatewayId: gatewayId as Id<"gateways"> });
      const current = rows.find((row: any) => String(row._id) === String(id));
      if (!current) return NextResponse.json({ error: "Integration not found" }, { status: 404 });

      let nextSlug = undefined as string | undefined;
      if (body.integration?.slug || body.integration?.name) {
        const used = new Set(rows.filter((row: any) => String(row._id) !== String(id)).map((row: any) => String(row.slug)));
        nextSlug = ensureUniqueSlug(String(body.integration?.slug || body.integration?.name || current.slug), used);
      }

      await convexClient.mutation(api.functions.integrations.updateIntegration, {
        id,
        ...(body.integration?.name !== undefined ? { name: String(body.integration.name) } : {}),
        ...(nextSlug ? { slug: nextSlug } : {}),
        ...(body.integration?.type !== undefined ? { type: normalizeIntegrationType(body.integration.type) } : {}),
        ...(body.integration?.baseUrl !== undefined ? { baseUrl: String(body.integration.baseUrl) } : {}),
        ...(body.integration?.authType !== undefined ? { authType: normalizeAuthType(body.integration.authType) } : {}),
        ...(body.integration?.authConfig !== undefined ? { authConfig: body.integration.authConfig } : {}),
        ...(body.integration?.healthPath !== undefined ? { healthPath: String(body.integration.healthPath || "") } : {}),
        ...(body.integration?.enabled !== undefined ? { enabled: Boolean(body.integration.enabled) } : {}),
        ...(body.integration?.allowPrivateNetwork !== undefined
          ? { allowPrivateNetwork: Boolean(body.integration.allowPrivateNetwork) }
          : {}),
      });

      const secrets = body.secrets || {};
      if (Object.prototype.hasOwnProperty.call(secrets, "token")) {
        await setSecret(gatewayId as Id<"gateways">, id, "token", secrets.token);
      }
      if (Object.prototype.hasOwnProperty.call(secrets, "value")) {
        await setSecret(gatewayId as Id<"gateways">, id, "value", secrets.value);
      }
      if (Object.prototype.hasOwnProperty.call(secrets, "password")) {
        await setSecret(gatewayId as Id<"gateways">, id, "password", secrets.password);
      }

      await syncIntegrationTools(gatewayId as Id<"gateways">, id);
      return NextResponse.json({ ok: true });
    }

    if (action === "updateEndpoint") {
      const id = body.id as Id<"apiIntegrationEndpoints">;
      if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

      const rows = await convexClient.query(api.functions.integrations.list, { gatewayId: gatewayId as Id<"gateways"> });
      let foundIntegration: any = null;
      let foundEndpoint: any = null;
      for (const integration of rows as any[]) {
        const endpoint = (integration.endpoints || []).find((ep: any) => String(ep._id) === String(id));
        if (endpoint) {
          foundIntegration = integration;
          foundEndpoint = endpoint;
          break;
        }
      }
      if (!foundIntegration || !foundEndpoint) {
        return NextResponse.json({ error: "Endpoint not found" }, { status: 404 });
      }

      let nextSlug = undefined as string | undefined;
      if (body.endpoint?.slug || body.endpoint?.name) {
        const used = new Set<string>(
          (foundIntegration.endpoints || [])
            .filter((ep: any) => String(ep._id) !== String(id))
            .map((ep: any) => String(ep.slug)),
        );
        nextSlug = ensureUniqueSlug(
          String(body.endpoint?.slug || body.endpoint?.name || foundEndpoint.slug),
          used,
        );
      }

      await convexClient.mutation(api.functions.integrations.updateEndpoint, {
        id,
        ...(body.endpoint?.name !== undefined ? { name: String(body.endpoint.name) } : {}),
        ...(nextSlug ? { slug: nextSlug, toolName: buildToolName(foundIntegration.slug, nextSlug) } : {}),
        ...(body.endpoint?.method !== undefined ? { method: normalizeMethod(body.endpoint.method) } : {}),
        ...(body.endpoint?.path !== undefined ? { path: sanitizePath(body.endpoint.path) } : {}),
        ...(body.endpoint?.description !== undefined ? { description: String(body.endpoint.description || "") } : {}),
        ...(body.endpoint?.headers !== undefined ? { headers: body.endpoint.headers } : {}),
        ...(body.endpoint?.queryTemplate !== undefined ? { queryTemplate: body.endpoint.queryTemplate } : {}),
        ...(body.endpoint?.bodyTemplate !== undefined ? { bodyTemplate: body.endpoint.bodyTemplate } : {}),
        ...(body.endpoint?.argsSchema !== undefined ? { argsSchema: body.endpoint.argsSchema } : {}),
        ...(body.endpoint?.timeoutMs !== undefined ? { timeoutMs: Number(body.endpoint.timeoutMs) } : {}),
        ...(body.endpoint?.enabled !== undefined ? { enabled: Boolean(body.endpoint.enabled) } : {}),
        ...(body.endpoint?.exposeAsTool !== undefined ? { exposeAsTool: Boolean(body.endpoint.exposeAsTool) } : {}),
        ...(body.endpoint?.requiresApproval !== undefined
          ? { requiresApproval: Boolean(body.endpoint.requiresApproval) }
          : {}),
      });

      await syncIntegrationTools(gatewayId as Id<"gateways">, foundIntegration._id);
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Unsupported action" }, { status: 400 });
  } catch (err) {
    return handleGatewayError(err);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { gatewayId, role } = await getGatewayContext(req);
    requireToolManager(role);
    const body = await req.json();
    const action = String(body.action || "");

    if (action === "removeIntegration") {
      const id = body.id as Id<"apiIntegrations">;
      if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

      const rows = await convexClient.query(api.functions.integrations.list, { gatewayId: gatewayId as Id<"gateways"> });
      const current = rows.find((row: any) => String(row._id) === String(id));
      if (!current) return NextResponse.json({ error: "Integration not found" }, { status: 404 });

      await convexClient.mutation(api.functions.integrations.removeIntegration, { id });
      await setSecret(gatewayId as Id<"gateways">, id, "token", "");
      await setSecret(gatewayId as Id<"gateways">, id, "value", "");
      await setSecret(gatewayId as Id<"gateways">, id, "password", "");
      await syncIntegrationTools(gatewayId as Id<"gateways">);
      return NextResponse.json({ ok: true });
    }

    if (action === "removeEndpoint") {
      const id = body.id as Id<"apiIntegrationEndpoints">;
      if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

      const rows = await convexClient.query(api.functions.integrations.list, { gatewayId: gatewayId as Id<"gateways"> });
      let integrationId: Id<"apiIntegrations"> | null = null;
      for (const integration of rows as any[]) {
        if ((integration.endpoints || []).some((ep: any) => String(ep._id) === String(id))) {
          integrationId = integration._id;
          break;
        }
      }
      if (!integrationId) return NextResponse.json({ error: "Endpoint not found" }, { status: 404 });
      await convexClient.mutation(api.functions.integrations.removeEndpoint, { id });
      await syncIntegrationTools(gatewayId as Id<"gateways">, integrationId);
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Unsupported action" }, { status: 400 });
  } catch (err) {
    return handleGatewayError(err);
  }
}
