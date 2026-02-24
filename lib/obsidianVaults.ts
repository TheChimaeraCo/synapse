import { createHash, randomBytes } from "crypto";

export const OBSIDIAN_VAULTS_CONFIG_KEY = "sync.obsidian.vaults";
export const DEFAULT_VAULT_PATH = "obsidian-vault";

export interface ObsidianVaultKey {
  id: string;
  name: string;
  hash: string;
  prefix: string;
  createdAt: number;
  revokedAt?: number;
  lastUsedAt?: number;
}

export interface ObsidianVaultConfig {
  id: string;
  name: string;
  path: string;
  createdAt: number;
  updatedAt: number;
  keys: ObsidianVaultKey[];
}

function safeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function normalizeVaultPath(value: string): string {
  const normalized = safeString(value).replace(/\\/g, "/").replace(/^\/+/, "");
  if (!normalized) return DEFAULT_VAULT_PATH;
  const parts = normalized.split("/").filter(Boolean);
  if (parts.some((part) => part === "..")) {
    throw new Error("Invalid vault path");
  }
  return parts.join("/");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function buildTokenPrefix(token: string): string {
  if (token.length <= 16) return token;
  return `${token.slice(0, 8)}...${token.slice(-6)}`;
}

export function parseVaults(raw: string): ObsidianVaultConfig[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const now = Date.now();
    const out: ObsidianVaultConfig[] = [];
    for (const item of parsed) {
      const id = safeString(item?.id);
      const name = safeString(item?.name);
      const path = safeString(item?.path);
      if (!id || !name || !path) continue;
      let normalizedPath: string;
      try {
        normalizedPath = normalizeVaultPath(path);
      } catch {
        continue;
      }
      const keys = Array.isArray(item?.keys)
        ? item.keys
            .map((k: any) => {
              const keyId = safeString(k?.id);
              const keyName = safeString(k?.name);
              const hash = safeString(k?.hash);
              if (!keyId || !keyName || !hash) return null;
              return {
                id: keyId,
                name: keyName,
                hash,
                prefix: safeString(k?.prefix) || "",
                createdAt: Number(k?.createdAt) || now,
                revokedAt: k?.revokedAt ? Number(k.revokeAt || k.revokedAt) : undefined,
                lastUsedAt: k?.lastUsedAt ? Number(k.lastUsedAt) : undefined,
              } as ObsidianVaultKey;
            })
            .filter(Boolean) as ObsidianVaultKey[]
        : [];
      out.push({
        id,
        name,
        path: normalizedPath,
        createdAt: Number(item?.createdAt) || now,
        updatedAt: Number(item?.updatedAt) || now,
        keys,
      });
    }
    return out;
  } catch {
    return [];
  }
}

export function serializeVaults(vaults: ObsidianVaultConfig[]): string {
  return JSON.stringify(vaults);
}

export function sanitizeVaultsForClient(vaults: ObsidianVaultConfig[]) {
  return vaults.map((vault) => ({
    id: vault.id,
    name: vault.name,
    path: vault.path,
    createdAt: vault.createdAt,
    updatedAt: vault.updatedAt,
    keys: vault.keys.map((key) => ({
      id: key.id,
      name: key.name,
      prefix: key.prefix,
      createdAt: key.createdAt,
      revokedAt: key.revokedAt,
      lastUsedAt: key.lastUsedAt,
    })),
  }));
}

export function createVault(name: string, path: string): ObsidianVaultConfig {
  const now = Date.now();
  return {
    id: `vlt_${randomBytes(8).toString("hex")}`,
    name: safeString(name) || "Vault",
    path: normalizeVaultPath(path),
    createdAt: now,
    updatedAt: now,
    keys: [],
  };
}

export function createVaultKey(name: string): { key: ObsidianVaultKey; token: string } {
  const token = `sk-vlt-${randomBytes(24).toString("hex")}`;
  const now = Date.now();
  return {
    token,
    key: {
      id: `vkey_${randomBytes(8).toString("hex")}`,
      name: safeString(name) || "Vault Key",
      hash: hashToken(token),
      prefix: buildTokenPrefix(token),
      createdAt: now,
    },
  };
}

export function findVaultByPath(vaults: ObsidianVaultConfig[], vaultPath: string): ObsidianVaultConfig | null {
  let normalized: string;
  try {
    normalized = normalizeVaultPath(vaultPath);
  } catch {
    return null;
  }
  return vaults.find((v) => v.path === normalized) || null;
}

export function matchVaultKey(
  vaults: ObsidianVaultConfig[],
  token: string,
  requestedVaultPath?: string | null,
): { vault: ObsidianVaultConfig; key: ObsidianVaultKey } | null {
  const h = hashToken(token);
  let normalizedRequested: string | null = null;
  if (requestedVaultPath) {
    try {
      normalizedRequested = normalizeVaultPath(requestedVaultPath);
    } catch {
      normalizedRequested = null;
    }
  }

  for (const vault of vaults) {
    if (normalizedRequested && vault.path !== normalizedRequested) continue;
    for (const key of vault.keys) {
      if (key.revokedAt) continue;
      if (key.hash === h) return { vault, key };
    }
  }
  return null;
}

