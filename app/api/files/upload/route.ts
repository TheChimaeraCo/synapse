import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { convexClient } from "@/lib/convex";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

const MAX_SIZE_MB = 25;
const MAX_SIZE_BYTES = MAX_SIZE_MB * 1024 * 1024;

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const gatewayId = formData.get("gatewayId") as string;
    const sessionId = formData.get("sessionId") as string | null;

    if (!file || !gatewayId) {
      return NextResponse.json({ error: "file and gatewayId are required" }, { status: 400 });
    }

    if (file.size > MAX_SIZE_BYTES) {
      return NextResponse.json({ error: `File too large (max ${MAX_SIZE_MB}MB)` }, { status: 413 });
    }

    // Get upload URL from Convex
    const uploadUrl = await convexClient.mutation(api.functions.files.generateUploadUrl);

    // Upload file to Convex storage
    const uploadRes = await fetch(uploadUrl, {
      method: "POST",
      headers: { "Content-Type": file.type },
      body: await file.arrayBuffer(),
    });

    if (!uploadRes.ok) {
      return NextResponse.json({ error: "Upload to storage failed" }, { status: 500 });
    }

    const { storageId } = await uploadRes.json();

    // Create file record
    const fileId = await convexClient.mutation(api.functions.files.create, {
      gatewayId: gatewayId as Id<"gateways">,
      userId: (session.user as any).userId as Id<"authUsers">,
      sessionId: sessionId ? (sessionId as Id<"sessions">) : undefined,
      filename: file.name,
      mimeType: file.type,
      size: file.size,
      storageId,
    });

    // Get the created file
    const fileRecord = await convexClient.query(api.functions.files.get, { id: fileId });

    return NextResponse.json({
      id: fileId,
      filename: file.name,
      mimeType: file.type,
      size: file.size,
      url: fileRecord?.url,
    });
  } catch (err: any) {
    console.error("File upload error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
