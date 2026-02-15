import { NextRequest, NextResponse } from "next/server";
import { getConvexClient } from "@/lib/convex";
import { api } from "@/convex/_generated/api";

export async function POST(req: NextRequest) {
  try {
    const convex = getConvexClient();
    const { apiKey } = await req.json();
    const result = await convex.action(api.functions.config.testAnthropicKey, { apiKey });
    return NextResponse.json(result);
  } catch (err: any) {
    console.error("Test Anthropic error:", err);
    return NextResponse.json({ valid: false, error: err.message }, { status: 500 });
  }
}
