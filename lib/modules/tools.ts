import { convexClient } from "@/lib/convex";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { InstalledModuleRecord, ModuleManifest } from "@/lib/modules/manifest";

export interface NormalizedModuleTool {
  name: string;
  description: string;
  category: string;
  requiresApproval: boolean;
  parameters: Record<string, unknown>;
  handlerCode: string;
}

interface SyncModuleToolsResult {
  created: number;
  updated: number;
  unchanged: number;
}

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(",")}}`;
}

function startsWithPrefix(name: string, prefix: string): boolean {
  if (!prefix) return false;
  return (
    name === prefix ||
    name.startsWith(`${prefix}.`) ||
    name.startsWith(`${prefix}:`) ||
    name.startsWith(`${prefix}/`) ||
    name.startsWith(`${prefix}_`)
  );
}

function normalizePrefixList(moduleId: string, prefixes?: string[]): string[] {
  const cleaned = (prefixes || [])
    .map((prefix) => clean(prefix).toLowerCase())
    .filter(Boolean);
  if (!cleaned.includes(moduleId)) cleaned.unshift(moduleId);
  return Array.from(new Set(cleaned));
}

export function normalizeModuleTools(manifest: ModuleManifest): NormalizedModuleTool[] {
  const moduleId = clean(manifest.id).toLowerCase();
  if (!moduleId) return [];
  const prefixes = normalizePrefixList(moduleId, manifest.toolPrefixes);
  const tools = manifest.tools || [];

  const normalized: NormalizedModuleTool[] = [];
  for (const tool of tools) {
    const name = clean(tool.name);
    const description = clean(tool.description);
    const handlerCode = clean(tool.handlerCode);
    if (!name || !description || !handlerCode) continue;
    const owned = prefixes.some((prefix) => startsWithPrefix(name, prefix));
    if (!owned) continue;
    const category = clean(tool.category) || "module";
    const parameters = tool.parameters && typeof tool.parameters === "object" && !Array.isArray(tool.parameters)
      ? tool.parameters as Record<string, unknown>
      : {};
    normalized.push({
      name,
      description,
      category,
      requiresApproval: tool.requiresApproval === true,
      parameters,
      handlerCode,
    });
  }
  return normalized;
}

export function getModuleToolPrefixes(module: Pick<ModuleManifest | InstalledModuleRecord, "id" | "toolPrefixes">): string[] {
  return normalizePrefixList(clean(module.id).toLowerCase(), module.toolPrefixes || []);
}

export async function setModuleToolsEnabled(
  gatewayId: Id<"gateways">,
  module: Pick<ModuleManifest | InstalledModuleRecord, "id" | "toolPrefixes">,
  enabled: boolean,
): Promise<number> {
  const prefixes = getModuleToolPrefixes(module);
  const allTools = await convexClient.query(api.functions.tools.list, { gatewayId });
  const owned = allTools.filter((tool) => prefixes.some((prefix) => startsWithPrefix(tool.name, prefix)));
  for (const tool of owned) {
    if (tool.enabled === enabled) continue;
    await convexClient.mutation(api.functions.tools.update, {
      id: tool._id,
      enabled,
    });
  }
  return owned.length;
}

function toolNeedsReplace(existing: {
  description: string;
  category: string;
  parameters: unknown;
  handlerCode?: string;
}, next: NormalizedModuleTool): boolean {
  if (existing.description !== next.description) return true;
  if (existing.category !== next.category) return true;
  if ((existing.handlerCode || "") !== next.handlerCode) return true;
  return stableStringify(existing.parameters || {}) !== stableStringify(next.parameters || {});
}

export async function syncModuleTools(
  gatewayId: Id<"gateways">,
  manifest: ModuleManifest,
  enabled = true,
): Promise<SyncModuleToolsResult> {
  const wanted = normalizeModuleTools(manifest);
  if (wanted.length === 0) return { created: 0, updated: 0, unchanged: 0 };

  const allTools = await convexClient.query(api.functions.tools.list, { gatewayId });
  const byName = new Map(allTools.map((tool) => [tool.name, tool]));

  let created = 0;
  let updated = 0;
  let unchanged = 0;

  for (const tool of wanted) {
    const existing = byName.get(tool.name);
    if (!existing) {
      await convexClient.mutation(api.functions.tools.create, {
        gatewayId,
        name: tool.name,
        description: tool.description,
        category: tool.category,
        enabled,
        requiresApproval: tool.requiresApproval,
        parameters: tool.parameters,
        handlerCode: tool.handlerCode,
      });
      created += 1;
      continue;
    }

    if (toolNeedsReplace(existing, tool)) {
      await convexClient.mutation(api.functions.tools.remove, { id: existing._id });
      await convexClient.mutation(api.functions.tools.create, {
        gatewayId,
        name: tool.name,
        description: tool.description,
        category: tool.category,
        enabled,
        requiresApproval: tool.requiresApproval,
        parameters: tool.parameters,
        handlerCode: tool.handlerCode,
      });
      updated += 1;
      continue;
    }

    if (existing.enabled !== enabled || existing.requiresApproval !== tool.requiresApproval) {
      await convexClient.mutation(api.functions.tools.update, {
        id: existing._id,
        enabled,
        requiresApproval: tool.requiresApproval,
      });
      updated += 1;
      continue;
    }

    unchanged += 1;
  }

  return { created, updated, unchanged };
}

