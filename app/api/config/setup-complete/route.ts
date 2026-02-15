import { NextResponse } from "next/server";
import { getConvexClient } from "@/lib/convex";
import { api } from "@/convex/_generated/api";

export async function GET() {
  try {
    const convex = getConvexClient();
    const complete = await convex.query(api.functions.config.isSetupComplete);
    return NextResponse.json({ complete });
  } catch (err: any) {
    console.error("Setup complete check error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
