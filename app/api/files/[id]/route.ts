import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { convexClient } from "@/lib/convex";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const file = await convexClient.query(api.functions.files.get, {
      id: id as Id<"files">,
    });

    if (!file) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    let url = file.url;
    if (!url && file.storageId) {
      url = (await convexClient.query(api.functions.files.getUrl, { storageId: file.storageId })) || "";
    }
    if (!url) {
      return NextResponse.json({ error: "File has no URL" }, { status: 404 });
    }

    // Proxy the file instead of redirecting (Convex storage may be on localhost)
    const fileRes = await fetch(url);
    if (!fileRes.ok) {
      return NextResponse.json({ error: "Failed to fetch file from storage" }, { status: 502 });
    }

    const headers = new Headers();
    const contentType = fileRes.headers.get("content-type") || file.mimeType || "application/octet-stream";
    headers.set("Content-Type", contentType);
    headers.set("Cache-Control", "public, max-age=3600, immutable");
    if (fileRes.headers.get("content-length")) {
      headers.set("Content-Length", fileRes.headers.get("content-length")!);
    }

    return new NextResponse(fileRes.body, { status: 200, headers });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  try {
    await convexClient.mutation(api.functions.files.remove, {
      id: id as Id<"files">,
    });
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
