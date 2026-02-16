import { NextResponse } from "next/server";
import { convexClient } from "@/lib/convex";
import { api } from "@/convex/_generated/api";
import { execSync } from "child_process";
import { readFileSync } from "fs";
import { join } from "path";

const startTime = Date.now();

export async function GET() {
  const checks: Record<string, any> = {};

  // Convex connection
  try {
    const [healthChecks, circuitBreakers] = await Promise.all([
      convexClient.query(api.functions.health.getAll, {}),
      convexClient.query(api.functions.circuitBreakers.getAll, {}),
    ]);
    const unhealthy = healthChecks.filter((h: any) => h.status !== "healthy");
    checks.convex = { status: unhealthy.length === 0 ? "healthy" : "degraded", healthChecks, circuitBreakers };
  } catch (err: any) {
    checks.convex = { status: "error", error: err.message };
  }

  // PM2 status
  try {
    const pm2Out = execSync("pm2 jlist 2>/dev/null", { timeout: 5000 }).toString();
    const processes = JSON.parse(pm2Out);
    const synapse = processes.find((p: any) => p.name === "synapse-hub");
    checks.pm2 = synapse
      ? { status: synapse.pm2_env?.status || "unknown", pid: synapse.pid, memory: synapse.monit?.memory, cpu: synapse.monit?.cpu }
      : { status: "not_found" };
  } catch {
    checks.pm2 = { status: "unavailable" };
  }

  // Version
  let version = "unknown";
  try {
    const pkg = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8"));
    version = pkg.version;
  } catch {}

  // Memory
  const mem = process.memoryUsage();

  const overallStatus = checks.convex?.status === "error" ? "error" : checks.convex?.status === "degraded" ? "degraded" : "healthy";

  return NextResponse.json({
    status: overallStatus,
    version,
    uptime: Math.floor((Date.now() - startTime) / 1000),
    memory: {
      rss: Math.round(mem.rss / 1024 / 1024),
      heapUsed: Math.round(mem.heapUsed / 1024 / 1024),
      heapTotal: Math.round(mem.heapTotal / 1024 / 1024),
    },
    checks,
    timestamp: Date.now(),
  });
}
