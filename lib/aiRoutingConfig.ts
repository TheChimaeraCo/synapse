import type { TaskType } from "@/lib/modelRouter";
import { getProvider, PROVIDERS } from "@/lib/providers";

export const AI_PROVIDER_PROFILES_KEY = "ai.provider_profiles";
export const AI_DEFAULT_PROFILE_KEY = "ai.default_profile_id";
export const AI_CAPABILITY_ROUTES_KEY = "ai.capability_routes";
export const LEGACY_MODEL_ROUTING_KEY = "model_routing";

export const TASK_CAPABILITIES: TaskType[] = ["chat", "tool_use", "summary", "code", "analysis"];

export type AiCapability =
  | TaskType
  | "classifier"
  | "reflection"
  | "parse_pdf"
  | "voice_tts"
  | "voice_stt"
  | "onboarding";

export interface ProviderProfile {
  id: string;
  name: string;
  provider: string;
  apiKey?: string;
  authMethod?: string;
  baseUrl?: string;
  accountId?: string;
  defaultModel?: string;
  enabled?: boolean;
}

export interface RouteTarget {
  providerProfileId?: string;
  provider?: string;
  model?: string;
}

export type CapabilityRoutes = Record<string, RouteTarget>;

function asObject(raw: unknown): Record<string, any> | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  return raw as Record<string, any>;
}

function normalizeId(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+/, "")
    .replace(/-+$/, "")
    .slice(0, 64);
}

function ensureUniqueId(base: string, used: Set<string>): string {
  const cleaned = normalizeId(base) || "profile";
  if (!used.has(cleaned)) {
    used.add(cleaned);
    return cleaned;
  }
  let i = 2;
  while (used.has(`${cleaned}-${i}`)) i += 1;
  const id = `${cleaned}-${i}`;
  used.add(id);
  return id;
}

function cleanString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

export function defaultModelForProvider(providerSlug: string): string {
  return getProvider(providerSlug)?.defaultModel || PROVIDERS[0]?.defaultModel || "claude-sonnet-4-20250514";
}

export function parseProviderProfiles(raw?: string | null): ProviderProfile[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const usedIds = new Set<string>();
    const profiles: ProviderProfile[] = [];
    for (const item of parsed) {
      const obj = asObject(item);
      if (!obj) continue;
      const provider = cleanString(obj.provider);
      if (!provider) continue;
      const fallbackName = `${provider} profile`;
      const id = ensureUniqueId(cleanString(obj.id) || cleanString(obj.name) || fallbackName, usedIds);
      profiles.push({
        id,
        name: cleanString(obj.name) || fallbackName,
        provider,
        apiKey: cleanString(obj.apiKey),
        authMethod: cleanString(obj.authMethod),
        baseUrl: cleanString(obj.baseUrl),
        accountId: cleanString(obj.accountId),
        defaultModel: cleanString(obj.defaultModel),
        enabled: obj.enabled === false ? false : true,
      });
    }
    return profiles;
  } catch {
    return [];
  }
}

export function serializeProviderProfiles(profiles: ProviderProfile[]): string {
  const cleaned: ProviderProfile[] = [];
  const used = new Set<string>();
  for (const profile of profiles) {
    const provider = cleanString(profile.provider);
    if (!provider) continue;
    const id = ensureUniqueId(cleanString(profile.id) || cleanString(profile.name) || provider, used);
    cleaned.push({
      id,
      name: cleanString(profile.name) || `${provider} profile`,
      provider,
      apiKey: cleanString(profile.apiKey),
      authMethod: cleanString(profile.authMethod),
      baseUrl: cleanString(profile.baseUrl),
      accountId: cleanString(profile.accountId),
      defaultModel: cleanString(profile.defaultModel),
      enabled: profile.enabled === false ? false : true,
    });
  }
  return JSON.stringify(cleaned);
}

export function buildLegacyProfile(config: Record<string, string | undefined>): ProviderProfile | null {
  const provider = cleanString(config.ai_provider);
  const apiKey = cleanString(config.ai_api_key);
  if (!provider && !apiKey) return null;
  const model = cleanString(config.ai_model);
  return {
    id: "legacy-default",
    name: "Legacy Default",
    provider: provider || "anthropic",
    apiKey,
    authMethod: cleanString(config.ai_auth_method),
    baseUrl: cleanString(config.ai_base_url),
    accountId: cleanString(config.ai_account_id),
    defaultModel: model,
    enabled: true,
  };
}

function normalizeRouteTarget(value: unknown): RouteTarget | null {
  if (!value) return null;
  if (typeof value === "string") {
    const model = cleanString(value);
    return model ? { model } : null;
  }
  const obj = asObject(value);
  if (!obj) return null;
  const route: RouteTarget = {};
  const providerProfileId = cleanString(obj.providerProfileId);
  const provider = cleanString(obj.provider);
  const model = cleanString(obj.model);
  if (providerProfileId) route.providerProfileId = providerProfileId;
  if (provider) route.provider = provider;
  if (model) route.model = model;
  if (!route.providerProfileId && !route.provider && !route.model) return null;
  return route;
}

export function parseLegacyModelRouting(raw?: string | null): Partial<Record<TaskType, string>> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    const obj = asObject(parsed);
    if (!obj) return {};
    const result: Partial<Record<TaskType, string>> = {};
    for (const key of TASK_CAPABILITIES) {
      const model = cleanString(obj[key]);
      if (model) result[key] = model;
    }
    return result;
  } catch {
    return {};
  }
}

export function parseCapabilityRoutes(
  routesRaw?: string | null,
  legacyModelRoutingRaw?: string | null,
): CapabilityRoutes {
  const routes: CapabilityRoutes = {};
  if (routesRaw) {
    try {
      const parsed = JSON.parse(routesRaw);
      const obj = asObject(parsed);
      if (obj) {
        for (const [key, value] of Object.entries(obj)) {
          const route = normalizeRouteTarget(value);
          if (route) routes[key] = route;
        }
      }
    } catch {}
  }

  const legacy = parseLegacyModelRouting(legacyModelRoutingRaw);
  for (const capability of TASK_CAPABILITIES) {
    if (routes[capability]?.model) continue;
    const legacyModel = legacy[capability];
    if (legacyModel) routes[capability] = { ...(routes[capability] || {}), model: legacyModel };
  }

  return routes;
}

export function serializeCapabilityRoutes(routes: CapabilityRoutes): string {
  const cleaned: CapabilityRoutes = {};
  for (const [key, value] of Object.entries(routes || {})) {
    const route = normalizeRouteTarget(value);
    if (route) cleaned[key] = route;
  }
  return JSON.stringify(cleaned);
}

export function pickDefaultProfileId(profiles: ProviderProfile[], preferredId?: string | null): string | null {
  if (preferredId) {
    const hit = profiles.find((p) => p.id === preferredId && p.enabled !== false);
    if (hit) return hit.id;
  }
  const firstEnabled = profiles.find((p) => p.enabled !== false);
  return firstEnabled?.id || null;
}

export function buildLegacyRoutingFromCapabilities(routes: CapabilityRoutes): Record<TaskType, string> {
  const fallback = defaultModelForProvider("anthropic");
  const out: Record<TaskType, string> = {
    chat: routes.chat?.model || fallback,
    tool_use: routes.tool_use?.model || routes.chat?.model || fallback,
    summary: routes.summary?.model || routes.chat?.model || fallback,
    code: routes.code?.model || routes.chat?.model || fallback,
    analysis: routes.analysis?.model || routes.chat?.model || fallback,
  };
  return out;
}

export function capabilityToTaskType(capability: AiCapability): TaskType {
  if (capability === "classifier" || capability === "reflection" || capability === "parse_pdf") return "analysis";
  if (capability === "voice_tts" || capability === "voice_stt" || capability === "onboarding") return "chat";
  return capability;
}

