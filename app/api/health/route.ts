import { NextResponse } from "next/server";
import { convexClient } from "@/lib/convex";
import { api } from "@/convex/_generated/api";

export async function GET() {
  try {
    const [healthChecks, circuitBreakers] = await Promise.all([
      convexClient.query(api.functions.health.getAll, {}),
      convexClient.query(api.functions.circuitBreakers.getAll, {}),
    ]);

    const unhealthy = healthChecks.filter((h: any) => h.status !== "healthy");

    return NextResponse.json({
      status: unhealthy.length === 0 ? "healthy" : "degraded",
      healthChecks,
      circuitBreakers,
      timestamp: Date.now(),
    });
  } catch (err: any) {
    return NextResponse.json({
      status: "error",
      error: err.message,
      timestamp: Date.now(),
    }, { status: 500 });
  }
}
