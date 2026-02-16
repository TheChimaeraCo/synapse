import { NextRequest, NextResponse } from "next/server";
import { convexClient } from "@/lib/convex";
import { api } from "@/convex/_generated/api";
import { auth } from "@/auth";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const gatewayId = (session.user as any).gatewayId;
  if (!gatewayId) return NextResponse.json({ error: "No gateway" }, { status: 400 });

  try {
    const records = await convexClient.query(api.functions.parseHistory.list, {
      gatewayId,
      limit: 100,
    });
    return NextResponse.json(records);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const gatewayId = (session.user as any).gatewayId;
  if (!gatewayId) return NextResponse.json({ error: "No gateway" }, { status: 400 });

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  try {
    if (id) {
      await convexClient.mutation(api.functions.parseHistory.remove, { id: id as any });
    } else {
      await convexClient.mutation(api.functions.parseHistory.clearAll, { gatewayId });
    }
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
