import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const { botToken } = await req.json();
    if (!botToken) {
      return NextResponse.json({ valid: false, error: "No token provided" });
    }

    // Test the token by fetching the bot user from Discord API
    const res = await fetch("https://discord.com/api/v10/users/@me", {
      headers: { Authorization: `Bot ${botToken}` },
    });

    if (!res.ok) {
      return NextResponse.json({ valid: false, error: "Invalid token" });
    }

    const data = await res.json();
    return NextResponse.json({
      valid: true,
      botName: `${data.username}#${data.discriminator}`,
      botId: data.id,
    });
  } catch (err: any) {
    console.error("Test Discord error:", err);
    return NextResponse.json({ valid: false, error: err.message }, { status: 500 });
  }
}
