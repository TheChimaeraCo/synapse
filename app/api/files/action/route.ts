import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { execSync } from "child_process";

import { getGatewayContext, handleGatewayError } from "@/lib/gateway-context";
import { getWorkspacePath } from "@/lib/workspace";

function resolveSafe(inputPath: string, ws: string): string | null {
  const resolved = path.join(ws, inputPath);
  if (!resolved.startsWith(ws)) return null;
  return resolved;
}

export async function POST(req: NextRequest) {
  try {
    const { gatewayId } = await getGatewayContext(req);
    const ws = await getWorkspacePath(gatewayId);

    const body = await req.json();
    const { action, path: filePath, destination, content } = body;

    const resolved = resolveSafe(filePath, ws);
    if (!resolved) {
      return NextResponse.json({ error: "Invalid path" }, { status: 400 });
    }

    switch (action) {
      case "read": {
        const real = await fs.realpath(resolved).catch(() => resolved);
        if (!real.startsWith(ws)) {
          return NextResponse.json({ error: "Access denied" }, { status: 403 });
        }
        const stat = await fs.stat(resolved);
        if (stat.size > 5 * 1024 * 1024) {
          return NextResponse.json({ error: "File too large (>5MB)" }, { status: 400 });
        }
        const fileContent = await fs.readFile(resolved, "utf-8");
        return NextResponse.json({
          content: fileContent,
          size: stat.size,
          modified: stat.mtime.toISOString(),
          extension: path.extname(resolved),
        });
      }

      case "write": {
        if (content === undefined) {
          return NextResponse.json({ error: "Content required" }, { status: 400 });
        }
        await fs.mkdir(path.dirname(resolved), { recursive: true });
        await fs.writeFile(resolved, content, "utf-8");
        return NextResponse.json({ success: true });
      }

      case "delete": {
        const stat = await fs.stat(resolved);
        if (stat.isDirectory()) {
          await fs.rm(resolved, { recursive: true, force: true });
        } else {
          await fs.unlink(resolved);
        }
        return NextResponse.json({ success: true });
      }

      case "move": {
        if (!destination) {
          return NextResponse.json({ error: "Destination required" }, { status: 400 });
        }
        const dest = resolveSafe(destination, ws);
        if (!dest) {
          return NextResponse.json({ error: "Invalid destination" }, { status: 400 });
        }
        await fs.mkdir(path.dirname(dest), { recursive: true });
        await fs.rename(resolved, dest);
        return NextResponse.json({ success: true });
      }

      case "copy": {
        if (!destination) {
          return NextResponse.json({ error: "Destination required" }, { status: 400 });
        }
        const dest = resolveSafe(destination, ws);
        if (!dest) {
          return NextResponse.json({ error: "Invalid destination" }, { status: 400 });
        }
        await fs.mkdir(path.dirname(dest), { recursive: true });
        const stat = await fs.stat(resolved);
        if (stat.isDirectory()) {
          execSync(`cp -r ${JSON.stringify(resolved)} ${JSON.stringify(dest)}`);
        } else {
          await fs.copyFile(resolved, dest);
        }
        return NextResponse.json({ success: true });
      }

      case "mkdir": {
        await fs.mkdir(resolved, { recursive: true });
        return NextResponse.json({ success: true });
      }

      case "zip": {
        const zipPath = resolved + ".zip";
        const basename = path.basename(resolved);
        const dirname = path.dirname(resolved);
        execSync(`cd ${JSON.stringify(dirname)} && zip -r ${JSON.stringify(zipPath)} ${JSON.stringify(basename)}`);
        return NextResponse.json({
          success: true,
          zipPath: path.relative(ws, zipPath),
        });
      }

      case "unzip": {
        const dirname = path.dirname(resolved);
        execSync(`cd ${JSON.stringify(dirname)} && unzip -o ${JSON.stringify(resolved)}`);
        return NextResponse.json({ success: true });
      }

      default:
        return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }
  } catch (err) {
    return handleGatewayError(err);
  }
}
