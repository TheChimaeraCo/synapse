export interface ModuleManifest {
  manifestVersion: 1;
  id: string;
  name: string;
  version: string;
  description?: string;
  author?: string;
  homepage?: string;
  permissions?: string[];
  toolPrefixes?: string[];
  routes?: Array<{
    path: string;
    title?: string;
    icon?: string;
  }>;
}

export interface ModulePackage {
  manifest: ModuleManifest;
  files?: Record<string, string>;
  exportedAt: string;
  exportedBy?: string;
  synapseVersion?: string;
}

export interface InstalledModuleRecord {
  id: string;
  name: string;
  version: string;
  description?: string;
  author?: string;
  homepage?: string;
  toolPrefixes?: string[];
  routes?: Array<{
    path: string;
    title?: string;
    icon?: string;
  }>;
  enabled: boolean;
  source: "local" | "registry" | "imported";
  installedAt: number;
  updatedAt?: number;
}

export interface ModuleRouteConfig {
  mode?: "default" | "module";
  providerProfileId?: string;
  provider?: string;
  model?: string;
}

const MODULE_ID_RE = /^[a-z][a-z0-9-]{1,62}$/;
const SEMVER_RE = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

function toStringOrEmpty(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function validateModuleManifest(input: unknown): { ok: true; manifest: ModuleManifest } | { ok: false; error: string } {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, error: "Manifest must be an object" };
  }

  const raw = input as Record<string, unknown>;
  const id = toStringOrEmpty(raw.id);
  const name = toStringOrEmpty(raw.name);
  const version = toStringOrEmpty(raw.version);
  const manifestVersion = Number(raw.manifestVersion || 0);

  if (manifestVersion !== 1) return { ok: false, error: "manifestVersion must be 1" };
  if (!MODULE_ID_RE.test(id)) return { ok: false, error: "Invalid module id (use lowercase letters, numbers, and dashes)" };
  if (!name) return { ok: false, error: "name is required" };
  if (!SEMVER_RE.test(version)) return { ok: false, error: "version must be a valid semver string (e.g. 1.0.0)" };

  const permissions = Array.isArray(raw.permissions)
    ? raw.permissions.map((v) => toStringOrEmpty(v)).filter(Boolean)
    : undefined;
  const toolPrefixes = Array.isArray(raw.toolPrefixes)
    ? raw.toolPrefixes.map((v) => toStringOrEmpty(v)).filter(Boolean)
    : undefined;
  const routes = Array.isArray(raw.routes)
    ? raw.routes
      .map((v) => {
        if (!v || typeof v !== "object" || Array.isArray(v)) return null;
        const route = v as Record<string, unknown>;
        const path = toStringOrEmpty(route.path);
        if (!path) return null;
        return {
          path,
          title: toStringOrEmpty(route.title) || undefined,
          icon: toStringOrEmpty(route.icon) || undefined,
        };
      })
      .filter(Boolean) as ModuleManifest["routes"]
    : undefined;

  const manifest: ModuleManifest = {
    manifestVersion: 1,
    id,
    name,
    version,
    description: toStringOrEmpty(raw.description) || undefined,
    author: toStringOrEmpty(raw.author) || undefined,
    homepage: toStringOrEmpty(raw.homepage) || undefined,
    permissions: permissions && permissions.length > 0 ? permissions : undefined,
    toolPrefixes: toolPrefixes && toolPrefixes.length > 0 ? toolPrefixes : undefined,
    routes: routes && routes.length > 0 ? routes : undefined,
  };
  return { ok: true, manifest };
}

export function validateModulePackage(input: unknown): { ok: true; pkg: ModulePackage } | { ok: false; error: string } {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, error: "Package must be an object" };
  }
  const raw = input as Record<string, unknown>;
  const manifestResult = validateModuleManifest(raw.manifest);
  if (!manifestResult.ok) return { ok: false, error: `Invalid manifest: ${manifestResult.error}` };

  const files: Record<string, string> = {};
  if (raw.files !== undefined) {
    if (!raw.files || typeof raw.files !== "object" || Array.isArray(raw.files)) {
      return { ok: false, error: "files must be an object map of path => content" };
    }
    for (const [k, v] of Object.entries(raw.files as Record<string, unknown>)) {
      if (typeof v !== "string") return { ok: false, error: `files["${k}"] must be string` };
      files[k] = v;
    }
  }

  return {
    ok: true,
    pkg: {
      manifest: manifestResult.manifest,
      files: Object.keys(files).length > 0 ? files : undefined,
      exportedAt: toStringOrEmpty(raw.exportedAt) || new Date().toISOString(),
      exportedBy: toStringOrEmpty(raw.exportedBy) || undefined,
      synapseVersion: toStringOrEmpty(raw.synapseVersion) || undefined,
    },
  };
}
