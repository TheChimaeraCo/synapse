import { randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { GatewayError, getGatewayContext, handleGatewayError } from "@/lib/gateway-context";
import { convexClient } from "@/lib/convex";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

const DEFAULT_VAULT_PATH = "obsidian-vault";

function requireOwnerAdmin(role: string): void {
  if (role !== "owner" && role !== "admin") {
    throw new GatewayError(403, "Owner/admin role required");
  }
}

function clean(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim();
}

function normalizeVaultPath(value: string): string {
  const normalized = clean(value).replace(/\\/g, "/").replace(/^\/+/, "");
  if (!normalized) return DEFAULT_VAULT_PATH;
  const parts = normalized.split("/").filter(Boolean);
  if (parts.some((part) => part === "..")) {
    throw new GatewayError(400, "Invalid vault path");
  }
  return parts.join("/");
}

function buildSynapseBaseUrl(req: NextRequest): string {
  const forwardedProto = req.headers.get("x-forwarded-proto");
  const forwardedHost = req.headers.get("x-forwarded-host");
  if (forwardedProto && forwardedHost) {
    return `${forwardedProto}://${forwardedHost}`;
  }
  const host = req.headers.get("host");
  if (host) {
    const proto = host.includes("localhost") || host.includes("127.0.0.1") ? "http" : "https";
    return `${proto}://${host}`;
  }
  return req.nextUrl.origin;
}

async function getGatewayValue(gatewayId: Id<"gateways">, key: string): Promise<string> {
  try {
    const result = await convexClient.query(api.functions.gatewayConfig.getWithInheritance, { gatewayId, key });
    return result?.value || "";
  } catch {
    const result = await convexClient.query(api.functions.config.get, { key });
    return result || "";
  }
}

export async function GET(req: NextRequest) {
  try {
    const { gatewayId, role } = await getGatewayContext(req);
    requireOwnerAdmin(role);
    const gwId = gatewayId as Id<"gateways">;

    const [gateway, authToken, defaultVaultPath] = await Promise.all([
      convexClient.query(api.functions.gateways.get, { id: gwId }),
      getGatewayValue(gwId, "gateway.auth_token"),
      getGatewayValue(gwId, "sync.obsidian.default_vault_path"),
    ]);

    const baseUrl = buildSynapseBaseUrl(req);
    const vaultPath = clean(defaultVaultPath) || DEFAULT_VAULT_PATH;
    const tokenConfigured = Boolean(clean(authToken));
    const tokenPreview = tokenConfigured
      ? `${authToken.slice(0, 8)}...${authToken.slice(-6)}`
      : "";

    return NextResponse.json({
      gatewayId,
      gatewaySlug: gateway?.slug || "",
      gatewayName: gateway?.name || "",
      synapseBaseUrl: baseUrl,
      syncEndpoint: `${baseUrl}/sync/obsidian`,
      liveSyncProxyEndpoint: gateway?.slug ? `${baseUrl}/sync/obsidian/livesync/${gateway.slug}/` : "",
      defaultVaultPath: vaultPath,
      tokenConfigured,
      tokenPreview,
      pluginId: "synapse-obsidian-sync",
      pluginInstallPath: ".obsidian/plugins/synapse-obsidian-sync",
    });
  } catch (err) {
    return handleGatewayError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const { gatewayId, role } = await getGatewayContext(req);
    requireOwnerAdmin(role);
    const gwId = gatewayId as Id<"gateways">;

    const body = (await req.json()) as Record<string, unknown>;
    const action = clean(body.action);
    if (!action) return NextResponse.json({ error: "Missing action" }, { status: 400 });

    if (action === "revealToken") {
      const token = await getGatewayValue(gwId, "gateway.auth_token");
      return NextResponse.json({ token: clean(token) || "" });
    }

    if (action === "generateToken") {
      const generated = `sk-syn-${randomBytes(24).toString("hex")}`;
      await convexClient.mutation(api.functions.gatewayConfig.set, {
        gatewayId: gwId,
        key: "gateway.auth_token",
        value: generated,
      });
      return NextResponse.json({ token: generated });
    }

    if (action === "setVaultPath") {
      const nextPath = normalizeVaultPath(clean(body.vaultPath));
      await convexClient.mutation(api.functions.gatewayConfig.set, {
        gatewayId: gwId,
        key: "sync.obsidian.default_vault_path",
        value: nextPath,
      });
      return NextResponse.json({ defaultVaultPath: nextPath });
    }

    return NextResponse.json({ error: `Unknown action "${action}"` }, { status: 400 });
  } catch (err) {
    return handleGatewayError(err);
  }
}

