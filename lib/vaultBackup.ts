import path from "path";
import { createHash } from "crypto";

import { convexClient } from "@/lib/convex";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

export const DEFAULT_VAULT_PATH = "obsidian-vault";

export function normalizeRelative(input: string): string | null {
  const normalized = String(input || "").replace(/\\/g, "/").replace(/^\/+/, "");
  if (!normalized) return "";
  const parts = normalized.split("/").filter(Boolean);
  if (parts.some((part) => part === "..")) return null;
  return parts.join("/");
}

export async function getGatewayInheritedValue(gatewayId: string, key: string): Promise<string> {
  try {
    const row = await convexClient.query(api.functions.gatewayConfig.getWithInheritance, {
      gatewayId: gatewayId as Id<"gateways">,
      key,
    });
    return String(row?.value || "");
  } catch {
    return "";
  }
}

export async function getDefaultVaultPath(gatewayId: string): Promise<string> {
  const configured = await getGatewayInheritedValue(gatewayId, "sync.obsidian.default_vault_path");
  const clean = normalizeRelative(configured);
  if (clean !== null && clean) return clean;
  return DEFAULT_VAULT_PATH;
}

export async function isConvexVaultBackupEnabled(gatewayId: string): Promise<boolean> {
  const enabled = (await getGatewayInheritedValue(gatewayId, "sync.obsidian.convex_backup_enabled")).toLowerCase();
  return enabled === "true" || enabled === "1" || enabled === "yes" || enabled === "on";
}

function detectMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  const map: Record<string, string> = {
    ".md": "text/markdown",
    ".markdown": "text/markdown",
    ".txt": "text/plain",
    ".json": "application/json",
    ".csv": "text/csv",
    ".yaml": "application/yaml",
    ".yml": "application/yaml",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".pdf": "application/pdf",
    ".zip": "application/zip",
  };
  return map[ext] || "application/octet-stream";
}

export interface BackupVaultEntryArgs {
  gatewayId: string;
  vaultPath: string;
  relativePath: string;
  source: "sync_upsert" | "sync_delete" | "manual_full" | "manual_delta";
  runId?: string;
  deleted?: boolean;
  content?: Buffer;
  mtimeMs?: number;
}

export async function backupVaultEntryToConvex(args: BackupVaultEntryArgs): Promise<string> {
  const normalizedVaultPath = normalizeRelative(args.vaultPath) || DEFAULT_VAULT_PATH;
  const normalizedRelativePath = normalizeRelative(args.relativePath);
  if (normalizedRelativePath === null || !normalizedRelativePath) {
    throw new Error(`Invalid relative vault path: ${args.relativePath}`);
  }

  const isDeleted = Boolean(args.deleted);
  const filename = path.basename(normalizedRelativePath);
  const mimeType = isDeleted ? "application/x-synapse-vault-delete" : detectMimeType(filename);
  const metadataBase = {
    type: "vault_backup",
    version: 1,
    source: args.source,
    runId: args.runId || null,
    vaultPath: normalizedVaultPath,
    relativePath: normalizedRelativePath,
    deleted: isDeleted,
    mtimeMs: args.mtimeMs || null,
    createdAt: Date.now(),
  };

  let storageId: string | undefined;
  let size = 0;
  let hash: string | undefined;

  if (!isDeleted) {
    if (!args.content) throw new Error("Backup content is required for non-delete entries");
    size = args.content.byteLength;
    hash = createHash("sha256").update(args.content).digest("hex");
    const uploadUrl = await convexClient.mutation(api.functions.files.generateUploadUrl, {});
    const uploadRes = await fetch(uploadUrl, {
      method: "POST",
      headers: { "Content-Type": mimeType },
      body: new Uint8Array(args.content),
    });
    if (!uploadRes.ok) {
      const text = await uploadRes.text().catch(() => "");
      throw new Error(`Convex upload failed (${uploadRes.status}): ${text || uploadRes.statusText}`);
    }
    const uploadJson = await uploadRes.json().catch(() => ({}));
    if (!uploadJson?.storageId) {
      throw new Error("Convex upload did not return storageId");
    }
    storageId = uploadJson.storageId;
  }

  const metadata = JSON.stringify({
    ...metadataBase,
    size,
    hash: hash || null,
  });

  const fileId = await convexClient.mutation(api.functions.files.create, {
    gatewayId: args.gatewayId as Id<"gateways">,
    filename,
    mimeType,
    size,
    storageId,
    metadata,
  });
  return String(fileId);
}
