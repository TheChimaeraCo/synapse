import { NextRequest, NextResponse } from "next/server";
import { getGatewayContext, handleGatewayError } from "@/lib/gateway-context";
import { convexClient } from "@/lib/convex";
import { api } from "@/convex/_generated/api";

function clampLimit(input: string | null): number {
  const parsed = Number.parseInt(input || "", 10);
  if (!Number.isFinite(parsed)) return 50;
  return Math.max(1, Math.min(parsed, 200));
}

function parseDetails(details?: string): Record<string, unknown> | null {
  if (!details) return null;
  try {
    return JSON.parse(details) as Record<string, unknown>;
  } catch {
    return { message: details };
  }
}

export async function GET(req: NextRequest) {
  try {
    const { gatewayId } = await getGatewayContext(req);
    const url = new URL(req.url);
    const limit = clampLimit(url.searchParams.get("limit"));
    const status = (url.searchParams.get("status") || "all").toLowerCase();
    const scanSize = Math.min(Math.max(limit * 8, 200), 1000);

    const recent = await convexClient.query(api.functions.auditLog.getRecent, { limit: scanSize });
    const filtered = recent
      .filter((entry) => entry.resource === "obsidian_sync")
      .filter((entry) => !entry.resourceId || entry.resourceId === gatewayId)
      .filter((entry) => {
        if (status === "error") return entry.action === "sync.obsidian.error";
        if (status === "success") return entry.action === "sync.obsidian.success";
        return entry.action.startsWith("sync.obsidian.");
      })
      .slice(0, limit)
      .map((entry) => ({
        _id: entry._id,
        timestamp: entry.timestamp,
        action: entry.action,
        resourceId: entry.resourceId,
        ip: entry.ip,
        details: entry.details,
        detailsJson: parseDetails(entry.details),
      }));

    return NextResponse.json({
      logs: filtered,
      count: filtered.length,
    });
  } catch (err) {
    return handleGatewayError(err);
  }
}

