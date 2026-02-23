import { convexClient } from "@/lib/convex";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

const MODULE_STORE_KEY_PREFIX = "modules.data.";
const MODULE_STORE_VERSION = 1;
const MAX_STORE_BYTES = 900_000;

export interface ModuleStoreRecord {
  id: string;
  data: unknown;
  tags?: string[];
  createdAt: number;
  updatedAt: number;
}

interface ModuleStoreDocument {
  version: number;
  entities: Record<string, Record<string, ModuleStoreRecord>>;
}

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeModuleId(value: string): string {
  const id = clean(value).toLowerCase();
  if (!/^[a-z][a-z0-9-]{1,62}$/.test(id)) {
    throw new Error("Invalid module id");
  }
  return id;
}

function normalizeEntity(value: string): string {
  const entity = clean(value).toLowerCase();
  if (!/^[a-z][a-z0-9_-]{1,63}$/.test(entity)) {
    throw new Error("Invalid entity name");
  }
  return entity;
}

function normalizeRecordId(value: string): string {
  const trimmed = clean(value);
  if (!trimmed) throw new Error("Record id is required");
  if (trimmed.length > 200) throw new Error("Record id is too long");
  if (trimmed.includes("\n") || trimmed.includes("\r")) {
    throw new Error("Invalid record id");
  }
  return trimmed;
}

function normalizeTags(tags?: string[]): string[] | undefined {
  if (!Array.isArray(tags)) return undefined;
  const cleaned = tags
    .map((tag) => clean(tag).toLowerCase())
    .filter(Boolean)
    .slice(0, 30);
  return cleaned.length > 0 ? Array.from(new Set(cleaned)) : undefined;
}

function keyForModule(moduleId: string): string {
  return `${MODULE_STORE_KEY_PREFIX}${moduleId}`;
}

function parseStore(raw: string | null | undefined): ModuleStoreDocument {
  if (!raw) return { version: MODULE_STORE_VERSION, entities: {} };
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { version: MODULE_STORE_VERSION, entities: {} };
    }
    const obj = parsed as Record<string, unknown>;
    const entitiesRaw = obj.entities;
    const entities: ModuleStoreDocument["entities"] = {};
    if (entitiesRaw && typeof entitiesRaw === "object" && !Array.isArray(entitiesRaw)) {
      for (const [entity, recordsRaw] of Object.entries(entitiesRaw)) {
        let entityKey = "";
        try {
          entityKey = normalizeEntity(entity);
        } catch {
          continue;
        }
        if (!recordsRaw || typeof recordsRaw !== "object" || Array.isArray(recordsRaw)) continue;
        const outRecords: Record<string, ModuleStoreRecord> = {};
        for (const [recordId, recordValue] of Object.entries(recordsRaw)) {
          if (!recordValue || typeof recordValue !== "object" || Array.isArray(recordValue)) continue;
          const recordObj = recordValue as Record<string, unknown>;
          let id = "";
          try {
            const candidate = typeof recordObj.id === "string" ? recordObj.id : recordId;
            id = normalizeRecordId(candidate);
          } catch {
            continue;
          }
          const createdAt = typeof recordObj.createdAt === "number" ? recordObj.createdAt : Date.now();
          const updatedAt = typeof recordObj.updatedAt === "number" ? recordObj.updatedAt : createdAt;
          const tags = Array.isArray(recordObj.tags)
            ? normalizeTags(recordObj.tags.filter((t): t is string => typeof t === "string"))
            : undefined;
          outRecords[id] = {
            id,
            data: recordObj.data,
            tags,
            createdAt,
            updatedAt,
          };
        }
        entities[entityKey] = outRecords;
      }
    }
    return {
      version: MODULE_STORE_VERSION,
      entities,
    };
  } catch {
    return { version: MODULE_STORE_VERSION, entities: {} };
  }
}

async function readModuleStore(
  gatewayId: Id<"gateways">,
  moduleId: string,
): Promise<ModuleStoreDocument> {
  const key = keyForModule(moduleId);
  try {
    const row = await convexClient.query(api.functions.gatewayConfig.getWithInheritance, {
      gatewayId,
      key,
    });
    return parseStore(row?.value || "");
  } catch {
    const raw = await convexClient.query(api.functions.config.get, { key });
    return parseStore(raw || "");
  }
}

async function writeModuleStore(
  gatewayId: Id<"gateways">,
  moduleId: string,
  document: ModuleStoreDocument,
): Promise<void> {
  const key = keyForModule(moduleId);
  const encoded = JSON.stringify(document);
  if (Buffer.byteLength(encoded, "utf8") > MAX_STORE_BYTES) {
    throw new Error("Module store exceeded size limit");
  }
  try {
    await convexClient.mutation(api.functions.gatewayConfig.set, {
      gatewayId,
      key,
      value: encoded,
    });
  } catch {
    await convexClient.mutation(api.functions.config.set, { key, value: encoded });
  }
}

export async function listModuleRecords(
  gatewayId: Id<"gateways">,
  moduleIdInput: string,
  entityInput: string,
): Promise<ModuleStoreRecord[]> {
  const moduleId = normalizeModuleId(moduleIdInput);
  const entity = normalizeEntity(entityInput);
  const doc = await readModuleStore(gatewayId, moduleId);
  const rows = Object.values(doc.entities[entity] || {});
  return rows.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function getModuleRecord(
  gatewayId: Id<"gateways">,
  moduleIdInput: string,
  entityInput: string,
  recordIdInput: string,
): Promise<ModuleStoreRecord | null> {
  const moduleId = normalizeModuleId(moduleIdInput);
  const entity = normalizeEntity(entityInput);
  const recordId = normalizeRecordId(recordIdInput);
  const doc = await readModuleStore(gatewayId, moduleId);
  return doc.entities[entity]?.[recordId] || null;
}

export async function upsertModuleRecord(
  gatewayId: Id<"gateways">,
  moduleIdInput: string,
  entityInput: string,
  recordIdInput: string,
  data: unknown,
  tags?: string[],
): Promise<ModuleStoreRecord> {
  const moduleId = normalizeModuleId(moduleIdInput);
  const entity = normalizeEntity(entityInput);
  const recordId = normalizeRecordId(recordIdInput);
  const now = Date.now();

  const doc = await readModuleStore(gatewayId, moduleId);
  if (!doc.entities[entity]) doc.entities[entity] = {};
  const existing = doc.entities[entity][recordId];
  const next: ModuleStoreRecord = {
    id: recordId,
    data,
    tags: normalizeTags(tags) || existing?.tags,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };
  doc.entities[entity][recordId] = next;
  await writeModuleStore(gatewayId, moduleId, doc);
  return next;
}

export async function removeModuleRecord(
  gatewayId: Id<"gateways">,
  moduleIdInput: string,
  entityInput: string,
  recordIdInput: string,
): Promise<boolean> {
  const moduleId = normalizeModuleId(moduleIdInput);
  const entity = normalizeEntity(entityInput);
  const recordId = normalizeRecordId(recordIdInput);
  const doc = await readModuleStore(gatewayId, moduleId);
  const bucket = doc.entities[entity];
  if (!bucket || !bucket[recordId]) return false;
  delete bucket[recordId];
  await writeModuleStore(gatewayId, moduleId, doc);
  return true;
}

export async function searchModuleRecords(
  gatewayId: Id<"gateways">,
  moduleIdInput: string,
  entityInput: string,
  queryInput: string,
  limit = 20,
): Promise<ModuleStoreRecord[]> {
  const query = clean(queryInput).toLowerCase();
  if (!query) return [];
  const rows = await listModuleRecords(gatewayId, moduleIdInput, entityInput);
  const max = Math.max(1, Math.min(100, Math.trunc(limit)));
  return rows
    .filter((row) => {
      const text = JSON.stringify(row.data || {}).toLowerCase();
      if (text.includes(query)) return true;
      return Array.isArray(row.tags) && row.tags.some((tag) => tag.includes(query));
    })
    .slice(0, max);
}
