import { promises as fs } from "fs";
import path from "path";
import { convexClient } from "@/lib/convex";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { InstalledModuleRecord, ModuleManifest, ModuleRouteConfig } from "@/lib/modules/manifest";
import {
  MODULES_REGISTRY_KEY,
  MODULES_ROUTES_KEY,
  parseInstalledModules,
  parseModuleRoutes,
  serializeInstalledModules,
  serializeModuleRoutes,
} from "@/lib/modules/config";
import { syncModuleTools } from "@/lib/modules/tools";

const MODULES_DIR = path.join(process.cwd(), "modules");

export interface ForgeModuleInput {
  gatewayId: Id<"gateways">;
  prompt: string;
  moduleId?: string;
  moduleName?: string;
  install?: boolean;
  overwrite?: boolean;
}

export interface ForgeModuleResult {
  manifest: ModuleManifest;
  moduleDir: string;
  filesWritten: string[];
  installed: boolean;
  tools: { created: number; updated: number; unchanged: number };
}

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function slugify(value: string): string {
  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!normalized) return "";
  return normalized.slice(0, 63);
}

function titleCase(value: string): string {
  return value
    .split(/[\s-_]+/)
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(" ");
}

function byteLengthOf(value: string): number {
  return Buffer.byteLength(value, "utf8");
}

function inferModuleId(prompt: string, moduleId?: string): string {
  const explicit = slugify(clean(moduleId));
  if (explicit) return explicit;
  const lower = prompt.toLowerCase();
  if (/(meal|recipe|nutrition|grocery|shopping list|meal plan)/.test(lower)) {
    return "meal-planner";
  }
  const fromPrompt = slugify(prompt.split(/[.!?\n]/)[0] || "");
  if (fromPrompt.length >= 3) return fromPrompt;
  return "custom-module";
}

function inferModuleName(prompt: string, moduleName: string | undefined, moduleId: string): string {
  const explicit = clean(moduleName);
  if (explicit) return explicit;
  if (moduleId === "meal-planner") return "Meal Planner";
  const firstLine = clean(prompt.split(/\n+/)[0] || "");
  if (firstLine.length >= 3 && firstLine.length <= 80) return titleCase(firstLine);
  return titleCase(moduleId);
}

function mealPlannerToolSet(moduleId: string): NonNullable<ModuleManifest["tools"]> {
  const prefix = moduleId;
  return [
    {
      name: `${prefix}.save_recipe`,
      description: "Save or update a recipe with ingredients and instructions.",
      category: "module",
      parameters: {
        type: "object",
        properties: {
          id: { type: "string", description: "Optional recipe id (slug). If omitted, generated from name." },
          name: { type: "string", description: "Recipe name" },
          servings: { type: "number", description: "Default servings", default: 1 },
          ingredients: {
            type: "array",
            items: {
              type: "object",
              properties: {
                item: { type: "string" },
                amount: { type: "number" },
                unit: { type: "string" },
                category: { type: "string" },
                note: { type: "string" },
              },
              required: ["item"],
            },
          },
          instructions: { type: "array", items: { type: "string" } },
          tags: { type: "array", items: { type: "string" } },
          notes: { type: "string" },
        },
        required: ["name"],
      },
      handlerCode: `
const slug = (value) => String(value || "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
const id = slug(args.id || args.name);
if (!id) return "Recipe id or name is required.";
const existing = await moduleStore.get("recipes", id);
const existingData = existing && existing.data && typeof existing.data === "object" ? existing.data : {};
const ingredients = Array.isArray(args.ingredients) ? args.ingredients : (Array.isArray(existingData.ingredients) ? existingData.ingredients : []);
const instructions = Array.isArray(args.instructions) ? args.instructions : (Array.isArray(existingData.instructions) ? existingData.instructions : []);
const tags = Array.isArray(args.tags) ? args.tags.map((v) => String(v).trim()).filter(Boolean) : (Array.isArray(existingData.tags) ? existingData.tags : []);
const recipe = {
  id,
  name: String(args.name || existingData.name || id),
  servings: Number(args.servings || existingData.servings || 1),
  ingredients,
  instructions,
  tags,
  notes: typeof args.notes === "string" ? args.notes : (typeof existingData.notes === "string" ? existingData.notes : ""),
  createdAt: Number(existingData.createdAt || Date.now()),
  updatedAt: Date.now(),
};
await moduleStore.upsert("recipes", id, recipe, tags);
return "Saved recipe \\"" + recipe.name + "\\" (" + recipe.ingredients.length + " ingredients, " + recipe.instructions.length + " steps).";
      `.trim(),
    },
    {
      name: `${prefix}.list_recipes`,
      description: "List or search saved recipes by query or tag.",
      category: "module",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Text search over recipe data" },
          tag: { type: "string", description: "Filter by tag" },
          limit: { type: "number", default: 20 },
        },
      },
      handlerCode: `
const query = String(args.query || "").trim().toLowerCase();
const tag = String(args.tag || "").trim().toLowerCase();
const limit = Math.max(1, Math.min(100, Number(args.limit || 20)));
const rows = query ? await moduleStore.search("recipes", query, limit * 3) : await moduleStore.list("recipes");
const out = [];
for (const row of rows) {
  const recipe = row && row.data && typeof row.data === "object" ? row.data : {};
  const tags = Array.isArray(recipe.tags) ? recipe.tags : [];
  if (tag && !tags.some((t) => String(t).toLowerCase() === tag)) continue;
  out.push({
    id: recipe.id || row.id,
    name: recipe.name || row.id,
    servings: recipe.servings || 1,
    ingredientCount: Array.isArray(recipe.ingredients) ? recipe.ingredients.length : 0,
    tags,
    updatedAt: recipe.updatedAt || row.updatedAt,
  });
  if (out.length >= limit) break;
}
if (out.length === 0) return "No recipes found.";
return JSON.stringify(out, null, 2);
      `.trim(),
    },
    {
      name: `${prefix}.plan_week`,
      description: "Create or replace a weekly meal plan using saved recipe ids.",
      category: "module",
      parameters: {
        type: "object",
        properties: {
          weekStart: { type: "string", description: "Week start date (YYYY-MM-DD)" },
          meals: {
            type: "array",
            items: {
              type: "object",
              properties: {
                day: { type: "string" },
                mealType: { type: "string", description: "breakfast, lunch, dinner, snack" },
                recipeId: { type: "string" },
                servings: { type: "number" },
                notes: { type: "string" },
              },
              required: ["day", "mealType", "recipeId"],
            },
          },
        },
        required: ["weekStart", "meals"],
      },
      handlerCode: `
const weekStart = String(args.weekStart || "").trim();
if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(weekStart)) return "weekStart must be YYYY-MM-DD.";
if (!Array.isArray(args.meals) || args.meals.length === 0) return "Provide at least one meal.";
const cleanedMeals = args.meals.map((meal) => ({
  day: String(meal.day || "").trim(),
  mealType: String(meal.mealType || "meal").trim().toLowerCase(),
  recipeId: String(meal.recipeId || "").trim(),
  servings: Number(meal.servings || 1),
  notes: typeof meal.notes === "string" ? meal.notes : "",
})).filter((meal) => meal.day && meal.recipeId);
if (cleanedMeals.length === 0) return "No valid meals found.";
const plan = {
  weekStart,
  meals: cleanedMeals,
  updatedAt: Date.now(),
};
await moduleStore.upsert("plans", weekStart, plan, ["weekly-plan"]);
return "Saved weekly plan for " + weekStart + " with " + cleanedMeals.length + " meals.";
      `.trim(),
    },
    {
      name: `${prefix}.shopping_list`,
      description: "Generate an aggregated shopping list from a weekly meal plan.",
      category: "module",
      parameters: {
        type: "object",
        properties: {
          weekStart: { type: "string", description: "Week start date (YYYY-MM-DD)" },
        },
        required: ["weekStart"],
      },
      handlerCode: `
const weekStart = String(args.weekStart || "").trim();
if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(weekStart)) return "weekStart must be YYYY-MM-DD.";
const planRow = await moduleStore.get("plans", weekStart);
if (!planRow || !planRow.data) return "No plan found for " + weekStart + ".";
const plan = planRow.data;
const meals = Array.isArray(plan.meals) ? plan.meals : [];
const bucket = new Map();
for (const meal of meals) {
  const recipeId = String(meal.recipeId || "").trim();
  if (!recipeId) continue;
  const recipeRow = await moduleStore.get("recipes", recipeId);
  if (!recipeRow || !recipeRow.data) continue;
  const recipe = recipeRow.data;
  const servings = Number(meal.servings || recipe.servings || 1);
  const baseServings = Number(recipe.servings || 1) || 1;
  const scale = servings / baseServings;
  const ingredients = Array.isArray(recipe.ingredients) ? recipe.ingredients : [];
  for (const ingredient of ingredients) {
    const name = typeof ingredient === "string" ? ingredient : String(ingredient.item || "").trim();
    if (!name) continue;
    const unit = typeof ingredient === "string" ? "" : String(ingredient.unit || "").trim();
    const amountRaw = typeof ingredient === "string" ? 1 : Number(ingredient.amount || 1);
    const amount = Number.isFinite(amountRaw) ? amountRaw * scale : 1;
    const category = typeof ingredient === "string" ? "" : String(ingredient.category || "").trim().toLowerCase();
    const key = (name.toLowerCase() + "|" + unit.toLowerCase() + "|" + category);
    const existing = bucket.get(key) || { item: name, unit, amount: 0, category };
    existing.amount += amount;
    bucket.set(key, existing);
  }
}
const items = Array.from(bucket.values())
  .sort((a, b) => (a.category || "zzz").localeCompare(b.category || "zzz") || a.item.localeCompare(b.item))
  .map((item) => ({ ...item, amount: Math.round(item.amount * 100) / 100 }));
const shopping = { weekStart, items, generatedAt: Date.now() };
await moduleStore.upsert("shopping_lists", weekStart, shopping, ["shopping"]);
if (items.length === 0) return "No ingredients found from that plan.";
const lines = [];
let currentCategory = "";
for (const item of items) {
  const category = item.category || "other";
  if (category !== currentCategory) {
    currentCategory = category;
    lines.push("\\n[" + category.toUpperCase() + "]");
  }
  lines.push("- " + item.item + ": " + item.amount + (item.unit ? " " + item.unit : ""));
}
return "Shopping list for " + weekStart + ":" + lines.join("\\n");
      `.trim(),
    },
    {
      name: `${prefix}.nutrition_lookup`,
      description: "Lookup nutrition facts for an ingredient/food via OpenFoodFacts.",
      category: "module",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Food query text" },
          limit: { type: "number", default: 5 },
        },
        required: ["query"],
      },
      handlerCode: `
const query = String(args.query || "").trim();
if (!query) return "query is required.";
const limit = Math.max(1, Math.min(10, Number(args.limit || 5)));
const url = "https://world.openfoodfacts.org/cgi/search.pl?search_terms=" + encodeURIComponent(query) + "&search_simple=1&action=process&json=1&page_size=" + limit;
const res = await fetch(url, { headers: { "accept": "application/json" } });
if (!res.ok) return "Nutrition lookup failed: " + res.status;
const data = await res.json();
const products = Array.isArray(data.products) ? data.products : [];
const mapped = products.slice(0, limit).map((p) => ({
  name: p.product_name || p.generic_name || p.brands || "Unknown",
  calories_kcal_100g: p.nutriments?.["energy-kcal_100g"] ?? null,
  protein_g_100g: p.nutriments?.proteins_100g ?? null,
  carbs_g_100g: p.nutriments?.carbohydrates_100g ?? null,
  fat_g_100g: p.nutriments?.fat_100g ?? null,
  fiber_g_100g: p.nutriments?.fiber_100g ?? null,
  sugars_g_100g: p.nutriments?.sugars_100g ?? null,
});
if (mapped.length === 0) return "No nutrition entries found.";
return JSON.stringify(mapped, null, 2);
      `.trim(),
    },
  ];
}

function genericToolSet(moduleId: string): NonNullable<ModuleManifest["tools"]> {
  const prefix = moduleId;
  return [
    {
      name: `${prefix}.save_item`,
      description: "Save a namespaced item in this module's store.",
      category: "module",
      parameters: {
        type: "object",
        properties: {
          entity: { type: "string" },
          id: { type: "string" },
          data: {},
          tags: { type: "array", items: { type: "string" } },
        },
        required: ["entity", "id", "data"],
      },
      handlerCode: `
const entity = String(args.entity || "").trim().toLowerCase();
const id = String(args.id || "").trim();
if (!entity || !id) return "entity and id are required.";
await moduleStore.upsert(entity, id, args.data, Array.isArray(args.tags) ? args.tags : undefined);
return "Saved " + entity + "/" + id;
      `.trim(),
    },
    {
      name: `${prefix}.list_items`,
      description: "List items from a module entity collection.",
      category: "module",
      parameters: {
        type: "object",
        properties: {
          entity: { type: "string" },
          query: { type: "string" },
          limit: { type: "number", default: 20 },
        },
        required: ["entity"],
      },
      handlerCode: `
const entity = String(args.entity || "").trim().toLowerCase();
if (!entity) return "entity is required.";
const limit = Math.max(1, Math.min(100, Number(args.limit || 20)));
if (args.query) {
  const rows = await moduleStore.search(entity, String(args.query), limit);
  return JSON.stringify(rows, null, 2);
}
const rows = await moduleStore.list(entity);
return JSON.stringify(rows.slice(0, limit), null, 2);
      `.trim(),
    },
  ];
}

function buildManifest(prompt: string, moduleId: string, moduleName: string): ModuleManifest {
  const isMeal = /(meal|recipe|nutrition|grocery|shopping list|meal plan)/i.test(prompt);
  const routes = [{ path: `/modules/${moduleId}`, title: moduleName, icon: isMeal ? "utensils" : "package" }];
  const tools = isMeal ? mealPlannerToolSet(moduleId) : genericToolSet(moduleId);
  return {
    manifestVersion: 1,
    id: moduleId,
    name: moduleName,
    version: "0.1.0",
    description: isMeal
      ? "Plan meals, save recipes, generate weekly shopping lists, and lookup nutrition."
      : `Generated module from request: ${prompt.slice(0, 180)}`,
    author: "Synapse Forge",
    toolPrefixes: [moduleId],
    routes,
    permissions: ["module_store", "network"],
    tools,
  };
}

function renderReadme(manifest: ModuleManifest, prompt: string): string {
  const tools = manifest.tools || [];
  return `# ${manifest.name}

Generated by Synapse Module Forge.

## Request
${prompt}

## Module ID
\`${manifest.id}\`

## Tools
${tools.map((tool) => `- \`${tool.name}\`: ${tool.description}`).join("\n")}

## Notes
- Data persists in the module store namespace for this gateway.
- Configure provider/model routing in Settings -> Modules.
`;
}

async function writeModuleFiles(
  manifest: ModuleManifest,
  prompt: string,
  overwrite: boolean,
): Promise<{ moduleDir: string; filesWritten: string[] }> {
  const moduleDir = path.join(MODULES_DIR, manifest.id);
  const filesWritten: string[] = [];
  const moduleJsonPath = path.join(moduleDir, "module.json");
  const readmePath = path.join(moduleDir, "README.md");

  await fs.mkdir(moduleDir, { recursive: true });

  const moduleJson = `${JSON.stringify(manifest, null, 2)}\n`;
  if (!overwrite) {
    try {
      await fs.access(moduleJsonPath);
      throw new Error(`Module "${manifest.id}" already exists. Set overwrite=true to replace.`);
    } catch (err: any) {
      if (err?.code !== "ENOENT") throw err;
    }
  }

  await fs.writeFile(moduleJsonPath, moduleJson, "utf8");
  filesWritten.push(path.relative(process.cwd(), moduleJsonPath).replace(/\\/g, "/"));

  const readme = renderReadme(manifest, prompt);
  await fs.writeFile(readmePath, readme, "utf8");
  filesWritten.push(path.relative(process.cwd(), readmePath).replace(/\\/g, "/"));

  return { moduleDir, filesWritten };
}

async function getModuleState(gatewayId: Id<"gateways">): Promise<{
  installedModules: InstalledModuleRecord[];
  routes: Record<string, ModuleRouteConfig>;
}> {
  const keys = [MODULES_REGISTRY_KEY, MODULES_ROUTES_KEY];
  try {
    const values = await convexClient.query(api.functions.gatewayConfig.getMultiple, { gatewayId, keys });
    return {
      installedModules: parseInstalledModules(values[MODULES_REGISTRY_KEY]),
      routes: parseModuleRoutes(values[MODULES_ROUTES_KEY]),
    };
  } catch {
    const values = await convexClient.query(api.functions.config.getMultiple, { keys });
    return {
      installedModules: parseInstalledModules(values[MODULES_REGISTRY_KEY]),
      routes: parseModuleRoutes(values[MODULES_ROUTES_KEY]),
    };
  }
}

async function saveModuleState(
  gatewayId: Id<"gateways">,
  installedModules: InstalledModuleRecord[],
  routes: Record<string, ModuleRouteConfig>,
): Promise<void> {
  const payload = {
    [MODULES_REGISTRY_KEY]: serializeInstalledModules(installedModules),
    [MODULES_ROUTES_KEY]: serializeModuleRoutes(routes),
  };
  try {
    for (const [key, value] of Object.entries(payload)) {
      await convexClient.mutation(api.functions.gatewayConfig.set, { gatewayId, key, value });
    }
  } catch {
    for (const [key, value] of Object.entries(payload)) {
      await convexClient.mutation(api.functions.config.set, { key, value });
    }
  }
}

function upsertInstalledModule(modules: InstalledModuleRecord[], next: InstalledModuleRecord): InstalledModuleRecord[] {
  const now = Date.now();
  const existingIndex = modules.findIndex((row) => row.id === next.id);
  if (existingIndex < 0) {
    return [{ ...next, installedAt: next.installedAt || now }, ...modules];
  }
  const existing = modules[existingIndex];
  const merged: InstalledModuleRecord = {
    ...existing,
    ...next,
    installedAt: existing.installedAt || next.installedAt || now,
    updatedAt: now,
  };
  const copy = [...modules];
  copy.splice(existingIndex, 1, merged);
  return copy;
}

async function installModule(
  gatewayId: Id<"gateways">,
  manifest: ModuleManifest,
): Promise<{ created: number; updated: number; unchanged: number }> {
  const state = await getModuleState(gatewayId);
  const installedModules = upsertInstalledModule(state.installedModules, {
    id: manifest.id,
    name: manifest.name,
    version: manifest.version,
    description: manifest.description,
    author: manifest.author,
    homepage: manifest.homepage,
    toolPrefixes: manifest.toolPrefixes,
    routes: manifest.routes,
    tools: manifest.tools,
    enabled: true,
    source: "local",
    installedAt: Date.now(),
    updatedAt: Date.now(),
  });
  const routes = { ...state.routes };
  routes[manifest.id] = routes[manifest.id] || { mode: "default" };
  await saveModuleState(gatewayId, installedModules, routes);
  return await syncModuleTools(gatewayId, manifest, true);
}

export async function forgeModuleFromPrompt(input: ForgeModuleInput): Promise<ForgeModuleResult> {
  const prompt = clean(input.prompt);
  if (!prompt) throw new Error("Prompt is required");
  if (byteLengthOf(prompt) > 25_000) throw new Error("Prompt is too large");

  const moduleId = inferModuleId(prompt, input.moduleId);
  if (!/^[a-z][a-z0-9-]{1,62}$/.test(moduleId)) {
    throw new Error("Invalid module id");
  }
  const moduleName = inferModuleName(prompt, input.moduleName, moduleId);
  const manifest = buildManifest(prompt, moduleId, moduleName);

  const { moduleDir, filesWritten } = await writeModuleFiles(manifest, prompt, input.overwrite === true);
  const shouldInstall = input.install !== false;
  const tools = shouldInstall
    ? await installModule(input.gatewayId, manifest)
    : { created: 0, updated: 0, unchanged: 0 };

  return {
    manifest,
    moduleDir,
    filesWritten,
    installed: shouldInstall,
    tools,
  };
}

