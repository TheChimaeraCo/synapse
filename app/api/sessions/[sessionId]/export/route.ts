import { NextRequest, NextResponse } from "next/server";
import { getGatewayContext, handleGatewayError } from "@/lib/gateway-context";
import { getConvexClient } from "@/lib/convex";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    await getGatewayContext(req);
    const { sessionId } = await params;
    const format = req.nextUrl.searchParams.get("format") || "md";
    const convex = getConvexClient();

    const session = await convex.query(api.functions.sessions.get, {
      id: sessionId as Id<"sessions">,
    });
    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    const messages = await convex.query(api.functions.messages.getRecent, {
      sessionId: sessionId as Id<"sessions">,
      limit: 10000,
    });

    const title = session.title || `Session ${sessionId.slice(-6)}`;

    if (format === "json") {
      return new NextResponse(
        JSON.stringify({ session: { id: sessionId, title, createdAt: session.createdAt }, messages }, null, 2),
        {
          headers: {
            "Content-Type": "application/json",
            "Content-Disposition": `attachment; filename="${title.replace(/[^a-zA-Z0-9]/g, "_")}.json"`,
          },
        }
      );
    }

    // Markdown format
    const lines: string[] = [`# ${title}`, ``, `*Exported ${new Date().toISOString()}*`, ``];
    for (const msg of messages) {
      const role = msg.role === "user" ? "**You**" : msg.role === "assistant" ? "**Assistant**" : "*System*";
      const time = new Date(msg._creationTime).toLocaleString();
      lines.push(`### ${role} - ${time}`, ``, msg.content, ``);
    }

    return new NextResponse(lines.join("\n"), {
      headers: {
        "Content-Type": "text/markdown",
        "Content-Disposition": `attachment; filename="${title.replace(/[^a-zA-Z0-9]/g, "_")}.md"`,
      },
    });
  } catch (err: any) {
    return handleGatewayError(err);
  }
}
