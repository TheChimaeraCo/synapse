import { NextRequest, NextResponse } from "next/server";
import type { Id } from "@/convex/_generated/dataModel";
import { GatewayError, getGatewayContext, handleGatewayError } from "@/lib/gateway-context";
import { forgeModuleFromPrompt } from "@/lib/modules/forge";
import { logAudit } from "@/lib/auditLog";

const MAX_REQUEST_BYTES = 1_000_000;

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function requireOwnerAdmin(role: string): void {
  if (role !== "owner" && role !== "admin") {
    throw new GatewayError(403, "Owner/admin role required");
  }
}

function byteLengthOf(value: string): number {
  return Buffer.byteLength(value, "utf8");
}

export async function POST(req: NextRequest) {
  try {
    const { gatewayId, role, userId } = await getGatewayContext(req);
    requireOwnerAdmin(role);

    const rawBody = await req.text();
    if (byteLengthOf(rawBody) > MAX_REQUEST_BYTES) {
      return NextResponse.json({ error: "Request payload is too large" }, { status: 413 });
    }

    let body: Record<string, unknown>;
    try {
      body = (rawBody ? JSON.parse(rawBody) : {}) as Record<string, unknown>;
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const prompt = clean(body.prompt);
    if (!prompt) return NextResponse.json({ error: "prompt is required" }, { status: 400 });

    const result = await forgeModuleFromPrompt({
      gatewayId: gatewayId as Id<"gateways">,
      prompt,
      moduleId: clean(body.moduleId) || undefined,
      moduleName: clean(body.moduleName) || undefined,
      install: body.install !== false,
      overwrite: body.overwrite === true,
    });

    await logAudit(
      userId,
      "module.install",
      "module",
      `Forged module ${result.manifest.id}@${result.manifest.version} (installed=${result.installed}, tools=${result.tools.created}/${result.tools.updated}/${result.tools.unchanged})`,
      result.manifest.id,
    );

    return NextResponse.json({
      ok: true,
      module: {
        id: result.manifest.id,
        name: result.manifest.name,
        version: result.manifest.version,
      },
      filesWritten: result.filesWritten,
      installed: result.installed,
      tools: result.tools,
    });
  } catch (err) {
    return handleGatewayError(err);
  }
}

