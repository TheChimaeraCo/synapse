import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";

import { getGatewayContext, handleGatewayError } from "@/lib/gateway-context";
import { getWorkspacePath } from "@/lib/workspace";

export async function GET(req: NextRequest) {
  try {
    const { gatewayId } = await getGatewayContext(req);
    const ws = await getWorkspacePath(gatewayId);

    const url = new URL(req.url);
    const filePath = url.searchParams.get("path") || "";
    const resolved = path.join(ws, filePath);

    if (!resolved.startsWith(ws)) {
      return NextResponse.json({ error: "Invalid path" }, { status: 400 });
    }

    const real = await fs.realpath(resolved).catch(() => resolved);
    if (!real.startsWith(ws)) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    const stat = await fs.stat(resolved);
    if (!stat.isFile()) {
      return NextResponse.json({ error: "Not a file" }, { status: 400 });
    }

    const buffer = await fs.readFile(resolved);
    const filename = path.basename(resolved);
    const ext = path.extname(resolved).toLowerCase();

    const mimeTypes: Record<string, string> = {
      ".txt": "text/plain",
      ".json": "application/json",
      ".js": "text/javascript",
      ".ts": "text/typescript",
      ".html": "text/html",
      ".css": "text/css",
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".gif": "image/gif",
      ".svg": "image/svg+xml",
      ".zip": "application/zip",
      ".pdf": "application/pdf",
    };

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": mimeTypes[ext] || "application/octet-stream",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": String(stat.size),
      },
    });
  } catch (err) {
    return handleGatewayError(err);
  }
}
