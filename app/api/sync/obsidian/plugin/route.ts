import { promises as fs } from "fs";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { GatewayError, getGatewayContext, handleGatewayError } from "@/lib/gateway-context";

const PLUGIN_DIR = path.join(process.cwd(), "integrations", "obsidian-synapse-sync");
const ALLOWED_FILES: Record<string, { file: string; contentType: string }> = {
  "manifest.json": { file: "manifest.json", contentType: "application/json; charset=utf-8" },
  "main.js": { file: "main.js", contentType: "application/javascript; charset=utf-8" },
  "versions.json": { file: "versions.json", contentType: "application/json; charset=utf-8" },
  "README.md": { file: "README.md", contentType: "text/markdown; charset=utf-8" },
};

function requireOwnerAdmin(role: string): void {
  if (role !== "owner" && role !== "admin") {
    throw new GatewayError(403, "Owner/admin role required");
  }
}

export async function GET(req: NextRequest) {
  try {
    const { role } = await getGatewayContext(req);
    requireOwnerAdmin(role);

    const fileKey = req.nextUrl.searchParams.get("file") || "";
    const selected = ALLOWED_FILES[fileKey];
    if (!selected) {
      return NextResponse.json(
        { error: "Invalid file. Use manifest.json, main.js, versions.json, or README.md" },
        { status: 400 },
      );
    }

    const absolute = path.join(PLUGIN_DIR, selected.file);
    const content = await fs.readFile(absolute);
    return new NextResponse(content, {
      status: 200,
      headers: {
        "Content-Type": selected.contentType,
        "Content-Disposition": `attachment; filename="${selected.file}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    return handleGatewayError(err);
  }
}

