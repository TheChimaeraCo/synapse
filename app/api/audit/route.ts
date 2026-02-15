import { NextRequest, NextResponse } from "next/server";
import { getGatewayContext, handleGatewayError } from "@/lib/gateway-context";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";

const convex = new ConvexHttpClient(process.env.CONVEX_SELF_HOSTED_URL || "http://127.0.0.1:3220");

export async function GET(req: NextRequest) {
  try {
    const { role } = await getGatewayContext(req);
    if (role !== "owner" && role !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const limit = parseInt(searchParams.get("limit") || "50");
    const action = searchParams.get("action") || undefined;

    let logs;
    if (action) {
      logs = await convex.query(api.functions.auditLog.search, { action, limit });
    } else {
      logs = await convex.query(api.functions.auditLog.getRecent, { limit });
    }
    return NextResponse.json(logs);
  } catch (err) {
    return handleGatewayError(err);
  }
}
