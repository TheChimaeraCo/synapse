import { NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import { requirePermission } from "@/lib/auth-helpers";

const convex = new ConvexHttpClient(process.env.CONVEX_SELF_HOSTED_URL || "http://127.0.0.1:3220");

export async function GET() {
  const { error, session } = await requirePermission("users.read");
  if (error) return error;

  try {
    const gatewayId = (session!.user as any).gatewayId;
    const users = await convex.query(api.functions.roles.listUsers, { gatewayId });
    // Strip password hashes
    const safe = users.map(({ passwordHash, ...rest }: any) => rest);
    return NextResponse.json(safe);
  } catch (e: any) {
    console.error("Users list error:", e);
    return NextResponse.json({ error: "Failed to fetch users" }, { status: 500 });
  }
}
