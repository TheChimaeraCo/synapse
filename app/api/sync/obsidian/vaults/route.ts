import { NextRequest, NextResponse } from "next/server";
import { GatewayError, getGatewayContext, handleGatewayError } from "@/lib/gateway-context";
import { convexClient } from "@/lib/convex";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  createVault,
  createVaultKey,
  DEFAULT_VAULT_PATH,
  findVaultByPath,
  normalizeVaultPath,
  OBSIDIAN_VAULTS_CONFIG_KEY,
  parseVaults,
  sanitizeVaultsForClient,
  serializeVaults,
} from "@/lib/obsidianVaults";

function requireOwnerAdmin(role: string): void {
  if (role !== "owner" && role !== "admin") {
    throw new GatewayError(403, "Owner/admin role required");
  }
}

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

async function getGatewayValue(gatewayId: Id<"gateways">, key: string): Promise<string> {
  try {
    const result = await convexClient.query(api.functions.gatewayConfig.getWithInheritance, { gatewayId, key });
    return result?.value || "";
  } catch {
    return "";
  }
}

async function setGatewayValue(gatewayId: Id<"gateways">, key: string, value: string): Promise<void> {
  await convexClient.mutation(api.functions.gatewayConfig.set, {
    gatewayId,
    key,
    value,
  });
}

async function loadVaults(gatewayId: Id<"gateways">) {
  const raw = await getGatewayValue(gatewayId, OBSIDIAN_VAULTS_CONFIG_KEY);
  const parsed = parseVaults(raw);
  if (parsed.length > 0) return parsed;

  const defaultPathRaw = await getGatewayValue(gatewayId, "sync.obsidian.default_vault_path");
  const defaultPath = normalizeVaultPath(defaultPathRaw || DEFAULT_VAULT_PATH);
  return [createVault("Default Vault", defaultPath)];
}

export async function GET(req: NextRequest) {
  try {
    const { gatewayId, role } = await getGatewayContext(req);
    requireOwnerAdmin(role);
    const gwId = gatewayId as Id<"gateways">;
    const vaults = await loadVaults(gwId);
    return NextResponse.json({ vaults: sanitizeVaultsForClient(vaults) });
  } catch (err) {
    return handleGatewayError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const { gatewayId, role } = await getGatewayContext(req);
    requireOwnerAdmin(role);
    const gwId = gatewayId as Id<"gateways">;
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const action = clean(body.action);
    if (!action) {
      return NextResponse.json({ error: "Missing action" }, { status: 400 });
    }

    const vaults = await loadVaults(gwId);

    if (action === "createVault") {
      const name = clean(body.name) || "Vault";
      const vaultPath = normalizeVaultPath(clean(body.path) || DEFAULT_VAULT_PATH);
      if (findVaultByPath(vaults, vaultPath)) {
        return NextResponse.json({ error: "A vault with this path already exists" }, { status: 400 });
      }
      vaults.push(createVault(name, vaultPath));
      await setGatewayValue(gwId, OBSIDIAN_VAULTS_CONFIG_KEY, serializeVaults(vaults));
      return NextResponse.json({ vaults: sanitizeVaultsForClient(vaults) });
    }

    if (action === "deleteVault") {
      const vaultId = clean(body.vaultId);
      if (!vaultId) return NextResponse.json({ error: "vaultId required" }, { status: 400 });
      const next = vaults.filter((v) => v.id !== vaultId);
      if (next.length === vaults.length) return NextResponse.json({ error: "Vault not found" }, { status: 404 });
      await setGatewayValue(gwId, OBSIDIAN_VAULTS_CONFIG_KEY, serializeVaults(next));
      return NextResponse.json({ vaults: sanitizeVaultsForClient(next) });
    }

    if (action === "createKey") {
      const vaultId = clean(body.vaultId);
      const keyName = clean(body.keyName) || "Vault Key";
      if (!vaultId) return NextResponse.json({ error: "vaultId required" }, { status: 400 });
      const vault = vaults.find((v) => v.id === vaultId);
      if (!vault) return NextResponse.json({ error: "Vault not found" }, { status: 404 });
      const { key, token } = createVaultKey(keyName);
      vault.keys.push(key);
      vault.updatedAt = Date.now();
      await setGatewayValue(gwId, OBSIDIAN_VAULTS_CONFIG_KEY, serializeVaults(vaults));
      return NextResponse.json({
        vaults: sanitizeVaultsForClient(vaults),
        newKey: {
          vaultId: vault.id,
          keyId: key.id,
          name: key.name,
          token,
          prefix: key.prefix,
        },
      });
    }

    if (action === "revokeKey") {
      const vaultId = clean(body.vaultId);
      const keyId = clean(body.keyId);
      if (!vaultId || !keyId) {
        return NextResponse.json({ error: "vaultId and keyId required" }, { status: 400 });
      }
      const vault = vaults.find((v) => v.id === vaultId);
      if (!vault) return NextResponse.json({ error: "Vault not found" }, { status: 404 });
      const key = vault.keys.find((k) => k.id === keyId);
      if (!key) return NextResponse.json({ error: "Key not found" }, { status: 404 });
      key.revokedAt = Date.now();
      vault.updatedAt = Date.now();
      await setGatewayValue(gwId, OBSIDIAN_VAULTS_CONFIG_KEY, serializeVaults(vaults));
      return NextResponse.json({ vaults: sanitizeVaultsForClient(vaults) });
    }

    if (action === "renameVault") {
      const vaultId = clean(body.vaultId);
      const name = clean(body.name);
      if (!vaultId || !name) return NextResponse.json({ error: "vaultId and name required" }, { status: 400 });
      const vault = vaults.find((v) => v.id === vaultId);
      if (!vault) return NextResponse.json({ error: "Vault not found" }, { status: 404 });
      vault.name = name;
      vault.updatedAt = Date.now();
      await setGatewayValue(gwId, OBSIDIAN_VAULTS_CONFIG_KEY, serializeVaults(vaults));
      return NextResponse.json({ vaults: sanitizeVaultsForClient(vaults) });
    }

    return NextResponse.json({ error: `Unknown action "${action}"` }, { status: 400 });
  } catch (err) {
    return handleGatewayError(err);
  }
}

