import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";

import { getGatewayContext, handleGatewayError } from "@/lib/gateway-context";
import { getWorkspacePath } from "@/lib/workspace";

export async function POST(req: NextRequest) {
  try {
    const { gatewayId } = await getGatewayContext(req);
    const ws = await getWorkspacePath(gatewayId);

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const targetPath = formData.get("path") as string || "/";

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const dir = path.join(ws, targetPath);
    if (!dir.startsWith(ws)) {
      return NextResponse.json({ error: "Invalid path" }, { status: 400 });
    }

    await fs.mkdir(dir, { recursive: true });
    const filePath = path.join(dir, file.name);
    if (!filePath.startsWith(ws)) {
      return NextResponse.json({ error: "Invalid path" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    await fs.writeFile(filePath, buffer);

    return NextResponse.json({ success: true, path: path.relative(ws, filePath) });
  } catch (err) {
    return handleGatewayError(err);
  }
}
