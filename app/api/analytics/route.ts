import { NextRequest, NextResponse } from "next/server";
import { getGatewayContext, handleGatewayError } from "@/lib/gateway-context";
import { convexClient } from "@/lib/convex";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

export async function GET(req: NextRequest) {
  try {
    const { gatewayId } = await getGatewayContext(req);
    const gid = gatewayId as Id<"gateways">;

    // Get messages for last 30 days
    const messages = await convexClient.query(api.functions.messages.listByGateway, { gatewayId: gid, limit: 5000 });
    const sessionsResult = await convexClient.query(api.functions.sessions.list, { gatewayId: gid, limit: 5000 });
    const sessions = sessionsResult;

    const now = Date.now();
    const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;

    // Messages per day
    const msgsByDay: Record<string, number> = {};
    const tokensByDay: Record<string, { input: number; output: number }> = {};
    const latencies: number[] = [];
    const toolUsage: Record<string, number> = {};

    for (const msg of messages) {
      const ts = msg._creationTime || 0;
      if (ts < thirtyDaysAgo) continue;
      const day = new Date(ts).toISOString().slice(0, 10);
      msgsByDay[day] = (msgsByDay[day] || 0) + 1;

      if (msg.tokens) {
        if (!tokensByDay[day]) tokensByDay[day] = { input: 0, output: 0 };
        tokensByDay[day].input += msg.tokens.input;
        tokensByDay[day].output += msg.tokens.output;
      }

      if (msg.latencyMs && msg.role === "assistant") {
        latencies.push(msg.latencyMs);
      }

      // Extract tool usage from metadata
      if (msg.metadata?.toolCalls) {
        for (const tc of msg.metadata.toolCalls as any[]) {
          const name = tc.name || tc.toolName || "unknown";
          toolUsage[name] = (toolUsage[name] || 0) + 1;
        }
      }
    }

    // Sessions per day
    const sessionsByDay: Record<string, number> = {};
    for (const s of sessions) {
      const ts = s.createdAt || s._creationTime || 0;
      if (ts < thirtyDaysAgo) continue;
      const day = new Date(ts).toISOString().slice(0, 10);
      sessionsByDay[day] = (sessionsByDay[day] || 0) + 1;
    }

    // Build 30-day timeline
    const days: string[] = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now - i * 24 * 60 * 60 * 1000);
      days.push(d.toISOString().slice(0, 10));
    }

    // Latency distribution buckets
    const latencyBuckets = [
      { label: "<1s", max: 1000, count: 0 },
      { label: "1-3s", max: 3000, count: 0 },
      { label: "3-5s", max: 5000, count: 0 },
      { label: "5-10s", max: 10000, count: 0 },
      { label: ">10s", max: Infinity, count: 0 },
    ];
    for (const l of latencies) {
      const bucket = latencyBuckets.find((b) => l < b.max);
      if (bucket) bucket.count++;
    }

    return NextResponse.json({
      days,
      messagesPerDay: days.map((d) => msgsByDay[d] || 0),
      tokensPerDay: days.map((d) => tokensByDay[d] || { input: 0, output: 0 }),
      sessionsPerDay: days.map((d) => sessionsByDay[d] || 0),
      toolUsage: Object.entries(toolUsage).sort((a, b) => b[1] - a[1]).slice(0, 10),
      latencyBuckets,
      totalMessages: messages.length,
      totalSessions: sessions.length,
      avgLatency: latencies.length ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : 0,
    });
  } catch (err) { return handleGatewayError(err); }
}
