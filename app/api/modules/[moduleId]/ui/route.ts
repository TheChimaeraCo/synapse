import { promises as fs } from "fs";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { getGatewayContext, handleGatewayError } from "@/lib/gateway-context";
import { convexClient } from "@/lib/convex";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  MODULES_REGISTRY_KEY,
  parseInstalledModules,
} from "@/lib/modules/config";

const MODULES_DIR = path.join(process.cwd(), "modules");

interface PageEntry {
  path: string;
  title: string;
  component: string;
}

/**
 * Recursively scan a directory for .html/.htm files and return page entries.
 */
async function scanPages(
  dir: string,
  moduleId: string,
  basePrefix: string,
): Promise<PageEntry[]> {
  const pages: PageEntry[] = [];
  let entries: string[];
  try {
    entries = await fs.readdir(dir);
  } catch {
    return pages;
  }
  for (const entry of entries) {
    const fullPath = path.join(dir, entry);
    const stat = await fs.stat(fullPath).catch(() => null);
    if (!stat) continue;
    if (stat.isDirectory()) {
      const subPages = await scanPages(fullPath, moduleId, `${basePrefix}/${entry}`);
      pages.push(...subPages);
    } else if (entry.endsWith(".html") || entry.endsWith(".htm")) {
      const content = await fs.readFile(fullPath, "utf-8");
      const name = path.basename(entry, path.extname(entry));
      // index.html in a subdirectory maps to the directory name
      const pagePath = name === "index"
        ? `/modules/${moduleId}${basePrefix}`
        : `/modules/${moduleId}${basePrefix}/${name}`;
      const title = name === "index"
        ? basePrefix.split("/").pop() || moduleId
        : name;
      pages.push({
        path: pagePath,
        title: title.charAt(0).toUpperCase() + title.slice(1).replace(/-/g, " "),
        component: content,
      });
    }
  }
  return pages;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ moduleId: string }> }
) {
  try {
    const { moduleId } = await params;
    const { gatewayId } = await getGatewayContext(req);
    const gwId = gatewayId as Id<"gateways">;

    // Get installed modules
    const registryValue = await convexClient.query(api.functions.gatewayConfig.get, {
      gatewayId: gwId,
      key: MODULES_REGISTRY_KEY,
    });
    const installed = parseInstalledModules(registryValue);
    const mod = installed.find((m) => m.id === moduleId);

    if (!mod) {
      return NextResponse.json({ error: "Module not found" }, { status: 404 });
    }

    const moduleDir = path.join(MODULES_DIR, moduleId);
    const pages: PageEntry[] = [];

    // 1. Main ui.html in module root
    try {
      const indexPath = path.join(moduleDir, "ui.html");
      const content = await fs.readFile(indexPath, "utf-8");
      pages.push({
        path: `/modules/${moduleId}`,
        title: mod.name,
        component: content,
      });
    } catch {
      // No main ui.html
    }

    // 2. Recursively scan ui/ directory for sub-pages
    const uiDir = path.join(moduleDir, "ui");
    const subPages = await scanPages(uiDir, moduleId, "");
    pages.push(...subPages);

    return NextResponse.json({
      moduleId: mod.id,
      moduleName: mod.name,
      description: mod.description,
      icon: mod.routes?.[0]?.icon,
      pages,
      tools: (mod.tools || []).map((t) => ({
        name: t.name,
        description: t.description,
      })),
    });
  } catch (err) {
    return handleGatewayError(err);
  }
}
