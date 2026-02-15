import { NextRequest, NextResponse } from "next/server";
import { execSync } from "child_process";
import { getGatewayContext, handleGatewayError } from "@/lib/gateway-context";
import { getGatewaySlug } from "@/lib/workspace";

export async function GET(req: NextRequest) {
  try {
    const { gatewayId } = await getGatewayContext(req);
    const slug = await getGatewaySlug(gatewayId);

    const name = req.nextUrl.searchParams.get("name");
    const lines = req.nextUrl.searchParams.get("lines") || "50";

    if (!name) {
      return NextResponse.json({ error: "name parameter required" }, { status: 400 });
    }

    // Verify process belongs to this gateway
    if (slug && !name.startsWith(`${slug}-`) && name !== slug) {
      return NextResponse.json({ error: "Process does not belong to this gateway" }, { status: 403 });
    }

    const result = execSync(
      `pm2 logs ${JSON.stringify(name)} --nostream --lines ${parseInt(lines)} 2>&1`,
      { encoding: "utf-8", timeout: 10000, shell: "/bin/bash" }
    );
    return NextResponse.json({ logs: result });
  } catch (err: any) {
    if (err.statusCode) return handleGatewayError(err);
    const output = (err.stdout || "") + (err.stderr || "");
    return NextResponse.json({ logs: output || `Error: ${err.message}` });
  }
}
