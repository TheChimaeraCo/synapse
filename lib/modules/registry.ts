import { promises as fs } from "fs";
import path from "path";
import { ModuleManifest, ModulePackage, validateModuleManifest, validateModulePackage } from "./manifest";

const ROOT = process.cwd();
const MODULES_DIR = path.join(ROOT, "modules");
const IMPORTED_DIR = path.join(MODULES_DIR, "imported");
const REGISTRY_DIR = path.join(MODULES_DIR, "registry");
const MODULE_JSON = "module.json";
const PACKAGE_JSON = "module-package.json";

function isHidden(name: string): boolean {
  return name.startsWith(".");
}

async function ensureDirs(): Promise<void> {
  await fs.mkdir(MODULES_DIR, { recursive: true });
  await fs.mkdir(IMPORTED_DIR, { recursive: true });
  await fs.mkdir(REGISTRY_DIR, { recursive: true });
}

async function pathExists(target: string): Promise<boolean> {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

async function readJsonFile<T>(file: string): Promise<T | null> {
  try {
    const raw = await fs.readFile(file, "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

async function writeJsonFile(file: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

const IGNORED_DIRS = new Set(["registry", "imported", "node_modules", ".next", "dist", "build"]);
const TEXT_EXTS = new Set([".ts", ".tsx", ".js", ".jsx", ".json", ".md", ".txt", ".css", ".yml", ".yaml"]);

async function collectModuleFiles(dir: string, relativePrefix = ""): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (isHidden(entry.name)) continue;
    if (entry.name === PACKAGE_JSON) continue;
    const abs = path.join(dir, entry.name);
    const rel = relativePrefix ? `${relativePrefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      if (IGNORED_DIRS.has(entry.name)) continue;
      const nested = await collectModuleFiles(abs, rel);
      Object.assign(out, nested);
      continue;
    }
    if (!entry.isFile()) continue;
    const ext = path.extname(entry.name).toLowerCase();
    if (!TEXT_EXTS.has(ext) && entry.name !== MODULE_JSON) continue;
    const content = await fs.readFile(abs, "utf8");
    out[rel] = content;
  }
  return out;
}

function normalizeManifest(value: unknown): ModuleManifest | null {
  const parsed = validateModuleManifest(value);
  return parsed.ok ? parsed.manifest : null;
}

export async function listLocalManifests(): Promise<Array<{ manifest: ModuleManifest; sourcePath: string; source: "local" | "imported" }>> {
  await ensureDirs();
  const results: Array<{ manifest: ModuleManifest; sourcePath: string; source: "local" | "imported" }> = [];

  const scanDir = async (dir: string, source: "local" | "imported") => {
    if (!(await pathExists(dir))) return;
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (isHidden(entry.name)) continue;
      const moduleDir = path.join(dir, entry.name);
      const manifestRaw = await readJsonFile<unknown>(path.join(moduleDir, MODULE_JSON));
      const manifest = normalizeManifest(manifestRaw);
      if (!manifest) continue;
      results.push({ manifest, sourcePath: moduleDir, source });
    }
  };

  await scanDir(MODULES_DIR, "local");
  await scanDir(IMPORTED_DIR, "imported");

  return results;
}

export async function listRegistryPackages(): Promise<Array<{ manifest: ModuleManifest; packagePath: string }>> {
  await ensureDirs();
  const out: Array<{ manifest: ModuleManifest; packagePath: string }> = [];
  const moduleDirs = await fs.readdir(REGISTRY_DIR, { withFileTypes: true });
  for (const moduleDir of moduleDirs) {
    if (!moduleDir.isDirectory()) continue;
    const versionRoot = path.join(REGISTRY_DIR, moduleDir.name);
    const versions = await fs.readdir(versionRoot, { withFileTypes: true });
    for (const versionEntry of versions) {
      if (!versionEntry.isDirectory()) continue;
      const packagePath = path.join(versionRoot, versionEntry.name, PACKAGE_JSON);
      const pkgRaw = await readJsonFile<unknown>(packagePath);
      const pkgParsed = validateModulePackage(pkgRaw);
      if (!pkgParsed.ok) continue;
      out.push({ manifest: pkgParsed.pkg.manifest, packagePath });
    }
  }
  return out;
}

export async function findModuleManifest(moduleId: string, version?: string): Promise<{ manifest: ModuleManifest; source: "local" | "registry" | "imported"; sourcePath: string } | null> {
  const local = await listLocalManifests();
  const localHit = local
    .filter((m) => m.manifest.id === moduleId)
    .sort((a, b) => (a.manifest.version < b.manifest.version ? 1 : -1));
  if (localHit.length > 0) {
    const chosen = version ? localHit.find((m) => m.manifest.version === version) : localHit[0];
    if (chosen) return { manifest: chosen.manifest, source: chosen.source, sourcePath: chosen.sourcePath };
  }

  const pkgPath = version
    ? path.join(REGISTRY_DIR, moduleId, version, PACKAGE_JSON)
    : null;
  if (pkgPath) {
    const pkgRaw = await readJsonFile<unknown>(pkgPath);
    const parsed = validateModulePackage(pkgRaw);
    if (parsed.ok) {
      return {
        manifest: parsed.pkg.manifest,
        source: "registry",
        sourcePath: path.dirname(pkgPath),
      };
    }
  }

  if (!version) {
    const allRegistry = await listRegistryPackages();
    const hit = allRegistry
      .filter((p) => p.manifest.id === moduleId)
      .sort((a, b) => (a.manifest.version < b.manifest.version ? 1 : -1))[0];
    if (hit) {
      return {
        manifest: hit.manifest,
        source: "registry",
        sourcePath: path.dirname(hit.packagePath),
      };
    }
  }

  return null;
}

export async function exportModuleToRegistry(moduleId: string, version?: string): Promise<ModulePackage> {
  const found = await findModuleManifest(moduleId, version);
  if (!found) throw new Error(`Module "${moduleId}" not found`);

  const files = await collectModuleFiles(found.sourcePath);
  const pkg: ModulePackage = {
    manifest: found.manifest,
    files,
    exportedAt: new Date().toISOString(),
  };

  const packagePath = path.join(REGISTRY_DIR, found.manifest.id, found.manifest.version, PACKAGE_JSON);
  await writeJsonFile(packagePath, pkg);
  return pkg;
}

export async function importModulePackage(pkgInput: unknown): Promise<ModulePackage> {
  const parsed = validateModulePackage(pkgInput);
  if (!parsed.ok) throw new Error(parsed.error);
  const pkg = parsed.pkg;

  const moduleDir = path.join(IMPORTED_DIR, pkg.manifest.id);
  await fs.mkdir(moduleDir, { recursive: true });
  await writeJsonFile(path.join(moduleDir, MODULE_JSON), pkg.manifest);

  if (pkg.files) {
    for (const [rel, content] of Object.entries(pkg.files)) {
      const safeRel = rel.replace(/\\/g, "/").replace(/^\/+/, "");
      if (!safeRel || safeRel.includes("..")) continue;
      await fs.mkdir(path.dirname(path.join(moduleDir, safeRel)), { recursive: true });
      await fs.writeFile(path.join(moduleDir, safeRel), content, "utf8");
    }
  }

  const packagePath = path.join(REGISTRY_DIR, pkg.manifest.id, pkg.manifest.version, PACKAGE_JSON);
  await writeJsonFile(packagePath, pkg);

  return pkg;
}
