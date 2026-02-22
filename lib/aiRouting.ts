import { convexClient } from "@/lib/convex";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  AI_CAPABILITY_ROUTES_KEY,
  AI_DEFAULT_PROFILE_KEY,
  AI_PROVIDER_PROFILES_KEY,
  LEGACY_MODEL_ROUTING_KEY,
  buildLegacyProfile,
  capabilityToTaskType,
  defaultModelForProvider,
  parseCapabilityRoutes,
  parseLegacyModelRouting,
  parseProviderProfiles,
  pickDefaultProfileId,
  type AiCapability,
  type CapabilityRoutes,
  type ProviderProfile,
  type RouteTarget,
} from "@/lib/aiRoutingConfig";
import {
  constrainModel,
  findMatchingRoute,
  parseModelAliasMap,
  parseModelList,
  selectModel,
  type BudgetState,
  type ModelConstraints,
  type ModelRoute,
  type ModelRoutingConfig,
  type TaskType,
} from "@/lib/modelRouter";
import { getProviderApiKey, hydrateProviderEnv } from "@/lib/providerSecrets";

const AI_CONFIG_KEYS = [
  AI_PROVIDER_PROFILES_KEY,
  AI_DEFAULT_PROFILE_KEY,
  AI_CAPABILITY_ROUTES_KEY,
  LEGACY_MODEL_ROUTING_KEY,
  "ai_provider",
  "ai_api_key",
  "ai_model",
  "ai_auth_method",
  "ai_oauth_provider",
  "ai_oauth_credentials",
  "ai_base_url",
  "ai_account_id",
  "ai_project_id",
  "ai_location",
  "models.allowlist",
  "models.aliases",
  "models.fallback_chain",
] as const;

function clean(value?: string | null): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

function asGatewayId(gatewayId?: string | Id<"gateways"> | null): Id<"gateways"> | null {
  return gatewayId ? (gatewayId as Id<"gateways">) : null;
}

function mergeLegacyProfile(
  profiles: ProviderProfile[],
  legacyProfile: ProviderProfile | null,
): ProviderProfile[] {
  if (!legacyProfile) return profiles;
  if (profiles.some((p) => p.id === legacyProfile.id)) return profiles;
  return [...profiles, legacyProfile];
}

function buildModelRoutingConfig(
  capabilityRoutes: CapabilityRoutes,
  legacyRouting: Partial<Record<TaskType, string>>,
  fallbackModel: string,
): ModelRoutingConfig {
  const modelFor = (task: TaskType): string => {
    return (
      clean(capabilityRoutes[task]?.model) ||
      clean(legacyRouting[task]) ||
      fallbackModel
    );
  };
  return {
    chat: modelFor("chat"),
    tool_use: modelFor("tool_use"),
    summary: modelFor("summary"),
    code: modelFor("code"),
    analysis: modelFor("analysis"),
  };
}

function applyRoute(base: RouteTarget, override?: RouteTarget): RouteTarget {
  if (!override) return base;
  const next: RouteTarget = { ...base };
  if (clean(override.providerProfileId)) next.providerProfileId = clean(override.providerProfileId);
  if (clean(override.provider)) next.provider = clean(override.provider);
  if (clean(override.model)) next.model = clean(override.model);
  return next;
}

function findProfileById(profiles: ProviderProfile[], id?: string): ProviderProfile | null {
  if (!id) return null;
  return profiles.find((p) => p.id === id && p.enabled !== false) || null;
}

function findProfileByProvider(profiles: ProviderProfile[], provider?: string): ProviderProfile | null {
  if (!provider) return null;
  return profiles.find((p) => p.provider === provider && p.enabled !== false) || null;
}

function inferOAuthProviderFromModelProvider(provider: string): string | null {
  if (provider === "openai-codex") return "openai-codex";
  if (provider === "google-gemini-cli") return "google-gemini-cli";
  if (provider === "google-antigravity") return "google-antigravity";
  if (provider === "anthropic") return "anthropic";
  if (provider === "github-copilot" || provider === "copilot") return "github-copilot";
  return null;
}

function parseOAuthCredentials(raw?: string): Record<string, unknown> | null {
  const value = clean(raw);
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== "object") return null;
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

function extractCredentialsObject(
  parsed: Record<string, unknown> | null,
  oauthProvider: string,
): Record<string, unknown> | null {
  if (!parsed) return null;
  const nested = parsed[oauthProvider];
  if (nested && typeof nested === "object" && !Array.isArray(nested)) {
    const obj = { ...(nested as Record<string, unknown>) };
    if (obj.type === "oauth") delete obj.type;
    return obj;
  }
  if (parsed.access && parsed.refresh && parsed.expires) {
    const obj = { ...parsed };
    if (obj.type === "oauth") delete obj.type;
    return obj;
  }
  return null;
}

async function resolveApiKeyFromOAuth(
  provider: string,
  authMethod?: string,
  oauthProvider?: string,
  oauthCredentialsRaw?: string,
): Promise<string> {
  if (clean(authMethod) !== "oauth") return "";
  const oauthId = clean(oauthProvider) || inferOAuthProviderFromModelProvider(provider);
  if (!oauthId) return "";
  const parsed = parseOAuthCredentials(oauthCredentialsRaw);
  const credentials = extractCredentialsObject(parsed, oauthId);
  if (!credentials) return "";

  try {
    const { getOAuthApiKey } = await import("@mariozechner/pi-ai");
    const result = await getOAuthApiKey(oauthId as any, {
      [oauthId]: credentials as any,
    });
    return clean(result?.apiKey) || "";
  } catch {
    return "";
  }
}

async function resolveApiKeyFromEnv(provider: string): Promise<string> {
  const existing = clean(getProviderApiKey(provider));
  if (existing) return existing;
  try {
    const { getEnvApiKey } = await import("@mariozechner/pi-ai");
    return clean(getEnvApiKey(provider as any)) || "";
  } catch {
    return "";
  }
}

export interface LoadedAiRoutingConfig {
  values: Record<string, string>;
  providerProfiles: ProviderProfile[];
  defaultProviderProfileId: string | null;
  capabilityRoutes: CapabilityRoutes;
  legacyModelRouting: Partial<Record<TaskType, string>>;
  modelConstraints: ModelConstraints;
}

export async function loadAiRoutingConfig(
  gatewayId?: string | Id<"gateways"> | null,
): Promise<LoadedAiRoutingConfig> {
  const gwId = asGatewayId(gatewayId);
  let values: Record<string, string> = {};

  if (gwId) {
    try {
      const all = await convexClient.query(api.functions.gatewayConfig.getAll, { gatewayId: gwId });
      values = Object.fromEntries(
        AI_CONFIG_KEYS.map((key) => [key, clean(all[key]) || ""]),
      );
    } catch {
      values = await convexClient.query(api.functions.config.getMultiple, { keys: [...AI_CONFIG_KEYS] });
    }
  } else {
    values = await convexClient.query(api.functions.config.getMultiple, { keys: [...AI_CONFIG_KEYS] });
  }

  const legacyProfile = buildLegacyProfile({
    ai_provider: values.ai_provider,
    ai_api_key: values.ai_api_key,
    ai_model: values.ai_model,
    ai_auth_method: values.ai_auth_method,
    ai_oauth_provider: values.ai_oauth_provider,
    ai_oauth_credentials: values.ai_oauth_credentials,
    ai_base_url: values.ai_base_url,
    ai_account_id: values.ai_account_id,
    ai_project_id: values.ai_project_id,
    ai_location: values.ai_location,
  });
  const parsedProfiles = parseProviderProfiles(values[AI_PROVIDER_PROFILES_KEY]);
  const providerProfiles = mergeLegacyProfile(parsedProfiles, legacyProfile);

  const defaultProviderProfileId = pickDefaultProfileId(providerProfiles, values[AI_DEFAULT_PROFILE_KEY]);
  const capabilityRoutes = parseCapabilityRoutes(values[AI_CAPABILITY_ROUTES_KEY], values[LEGACY_MODEL_ROUTING_KEY]);
  const legacyModelRouting = parseLegacyModelRouting(values[LEGACY_MODEL_ROUTING_KEY]);
  const modelConstraints: ModelConstraints = {
    allowlist: parseModelList(values["models.allowlist"]),
    aliases: parseModelAliasMap(values["models.aliases"]),
    fallbackChain: parseModelList(values["models.fallback_chain"]),
  };

  return {
    values,
    providerProfiles,
    defaultProviderProfileId,
    capabilityRoutes,
    legacyModelRouting,
    modelConstraints,
  };
}

export interface ResolveAiSelectionOptions {
  gatewayId?: string | Id<"gateways"> | null;
  capability: AiCapability;
  message?: string;
  agentModel?: string | null;
  budget?: BudgetState;
  customRoutes?: ModelRoute[];
  routeOverride?: RouteTarget;
}

export interface ResolvedAiSelection {
  provider: string;
  model: string;
  apiKey: string;
  authMethod?: string;
  oauthProvider?: string;
  baseUrl?: string;
  accountId?: string;
  projectId?: string;
  location?: string;
  providerProfileId?: string;
  capabilityRoutes: CapabilityRoutes;
  providerProfiles: ProviderProfile[];
  modelConstraints: ModelConstraints;
}

export async function resolveAiSelection(
  options: ResolveAiSelectionOptions,
): Promise<ResolvedAiSelection> {
  const loaded = await loadAiRoutingConfig(options.gatewayId);
  const taskType = capabilityToTaskType(options.capability);
  const baseCapabilityRoute = loaded.capabilityRoutes[options.capability]
    || loaded.capabilityRoutes[taskType]
    || loaded.capabilityRoutes.chat
    || {};

  let resolvedRoute = applyRoute(baseCapabilityRoute, options.routeOverride);

  const matchedRoute = options.message
    ? findMatchingRoute(options.message, options.customRoutes)
    : null;
  if (matchedRoute) {
    resolvedRoute = applyRoute(resolvedRoute, {
      provider: matchedRoute.targetProvider,
      providerProfileId: matchedRoute.targetProviderProfileId,
      model: matchedRoute.targetModel,
    });
  }

  const defaultProfile = findProfileById(loaded.providerProfiles, loaded.defaultProviderProfileId || undefined);
  let selectedProfile = findProfileById(loaded.providerProfiles, clean(resolvedRoute.providerProfileId))
    || defaultProfile
    || null;

  const routeProvider = clean(resolvedRoute.provider);
  if (routeProvider && (!selectedProfile || selectedProfile.provider !== routeProvider)) {
    selectedProfile = findProfileByProvider(loaded.providerProfiles, routeProvider) || selectedProfile;
  }

  const provider = routeProvider
    || selectedProfile?.provider
    || clean(loaded.values.ai_provider)
    || "anthropic";

  const fallbackModel = selectedProfile?.defaultModel
    || clean(loaded.values.ai_model)
    || defaultModelForProvider(provider);

  const routingConfig = buildModelRoutingConfig(
    loaded.capabilityRoutes,
    loaded.legacyModelRouting,
    fallbackModel,
  );

  const budget: BudgetState = options.budget || { allowed: true };
  const selectedByRouter = selectModel(
    taskType,
    routingConfig,
    budget,
    clean(options.agentModel) || clean(loaded.values.ai_model),
    options.message,
    undefined,
    loaded.modelConstraints,
  );

  let model = clean(resolvedRoute.model) || clean(selectedByRouter) || fallbackModel;
  model = constrainModel(model || fallbackModel, loaded.modelConstraints);

  const authMethod = clean(selectedProfile?.authMethod) || clean(loaded.values.ai_auth_method);
  const oauthProvider = clean(selectedProfile?.oauthProvider) || clean(loaded.values.ai_oauth_provider);
  const oauthCredentialsRaw = clean(selectedProfile?.oauthCredentials) || clean(loaded.values.ai_oauth_credentials);

  const oauthApiKey = await resolveApiKeyFromOAuth(
    provider,
    authMethod,
    oauthProvider,
    oauthCredentialsRaw,
  );

  const envApiKey = await resolveApiKeyFromEnv(provider);

  const apiKey = oauthApiKey
    || clean(selectedProfile?.apiKey)
    || clean(loaded.values.ai_api_key)
    || envApiKey
    || "";

  if (apiKey) hydrateProviderEnv(provider, apiKey);

  const projectId = clean(selectedProfile?.projectId) || clean(loaded.values.ai_project_id);
  const location = clean(selectedProfile?.location) || clean(loaded.values.ai_location);
  if (provider === "google-vertex") {
    if (projectId) {
      process.env.GOOGLE_CLOUD_PROJECT = projectId;
      process.env.GCLOUD_PROJECT = projectId;
    }
    if (location) process.env.GOOGLE_CLOUD_LOCATION = location;
  }

  return {
    provider,
    model,
    apiKey,
    authMethod,
    oauthProvider,
    baseUrl: clean(selectedProfile?.baseUrl) || clean(loaded.values.ai_base_url),
    accountId: clean(selectedProfile?.accountId) || clean(loaded.values.ai_account_id),
    projectId,
    location,
    providerProfileId: selectedProfile?.id,
    capabilityRoutes: loaded.capabilityRoutes,
    providerProfiles: loaded.providerProfiles,
    modelConstraints: loaded.modelConstraints,
  };
}
