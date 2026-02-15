import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";

import { getGatewayContext, handleGatewayError } from "@/lib/gateway-context";
import { getWorkspacePath } from "@/lib/workspace";

function validatePath(inputPath: string, ws: string): string | null {
  const clean = inputPath.replace(/^\/+/, "");
  const resolved = path.join(ws, clean);
  if (!resolved.startsWith(ws)) return null;
  return resolved;
}

export async function GET(req: NextRequest) {
  try {
    const { gatewayId } = await getGatewayContext(req);
    const ws = await getWorkspacePath(gatewayId);

    const url = new URL(req.url);
    const inputPath = url.searchParams.get("path") || "/";
    const search = url.searchParams.get("search") || "";

    const resolved = validatePath(inputPath, ws);
    if (!resolved) {
      return NextResponse.json({ error: "Invalid path" }, { status: 400 });
    }

    // Check symlink doesn't escape
    const realPath = await fs.realpath(resolved).catch(() => resolved);
    if (!realPath.startsWith(ws)) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    if (search) {
      const results: any[] = [];
      async function searchDir(dir: string, depth = 0) {
        if (depth > 10 || results.length > 200) return;
        try {
          const entries = await fs.readdir(dir, { withFileTypes: true });
          for (const entry of entries) {
            if (entry.name === "node_modules" || entry.name === ".git") continue;
            const fullPath = path.join(dir, entry.name);
            if (entry.name.toLowerCase().includes(search.toLowerCase())) {
              const stat = await fs.stat(fullPath).catch(() => null);
              if (stat) {
                results.push({
                  name: entry.name,
                  path: path.relative(ws, fullPath),
                  type: entry.isDirectory() ? "directory" : "file",
                  size: stat.size,
                  modified: stat.mtime.toISOString(),
                  extension: entry.isDirectory() ? "" : path.extname(entry.name),
                });
              }
            }
            if (entry.isDirectory()) {
              await searchDir(fullPath, depth + 1);
            }
          }
        } catch {}
      }
      await searchDir(resolved);
      return NextResponse.json({ path: inputPath, entries: results, search: true });
    }

    const stat = await fs.stat(resolved);
    if (!stat.isDirectory()) {
      return NextResponse.json({ error: "Not a directory" }, { status: 400 });
    }

    const dirEntries = await fs.readdir(resolved, { withFileTypes: true });
    const entries = await Promise.all(
      dirEntries
        .filter(e => e.name !== ".git")
        .map(async (entry) => {
          const fullPath = path.join(resolved, entry.name);
          const stat = await fs.stat(fullPath).catch(() => null);
          return {
            name: entry.name,
            type: entry.isDirectory() ? "directory" as const : "file" as const,
            size: stat?.size || 0,
            modified: stat?.mtime.toISOString() || "",
            extension: entry.isDirectory() ? "" : path.extname(entry.name),
          };
        })
    );

    entries.sort((a, b) => {
      if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    return NextResponse.json({
      path: path.relative(ws, resolved) || "/",
      absolutePath: resolved,
      workspacePath: ws,
      entries,
    });
  } catch (err) {
    return handleGatewayError(err);
  }
}
