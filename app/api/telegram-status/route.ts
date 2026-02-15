import { NextResponse } from "next/server";
import { getGatewayContext, handleGatewayError } from "@/lib/gateway-context";
import { getTelegramBotStatus } from "../../../lib/telegram/startup";

export async function GET(req: Request) {
  try {
    await getGatewayContext(req);
    const status = getTelegramBotStatus();
    return NextResponse.json({
      ...status,
      uptimeFormatted: status.uptime
        ? `${Math.round(status.uptime / 60000)} minutes`
        : null,
      lastUpdateAgo: status.lastUpdateAt
        ? `${Math.round((Date.now() - status.lastUpdateAt) / 1000)} seconds ago`
        : null,
    });
  } catch (err) {
    return handleGatewayError(err);
  }
}
