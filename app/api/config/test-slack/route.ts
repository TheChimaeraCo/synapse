// app/api/config/test-slack/route.ts - Test Slack bot token
import { NextRequest, NextResponse } from "next/server";
import { WebClient } from "@slack/web-api";

export async function POST(req: NextRequest) {
  try {
    const { botToken } = await req.json();
    if (!botToken) {
      return NextResponse.json({ valid: false, error: "No bot token provided" });
    }

    const client = new WebClient(botToken);
    const result = await client.auth.test();

    if (result.ok) {
      return NextResponse.json({
        valid: true,
        botName: result.user,
        teamName: result.team,
        botId: result.bot_id || result.user_id,
      });
    } else {
      return NextResponse.json({ valid: false, error: "Auth test failed" });
    }
  } catch (err: any) {
    return NextResponse.json({ valid: false, error: err.message || "Connection failed" });
  }
}
