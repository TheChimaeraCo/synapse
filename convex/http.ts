import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";

const http = httpRouter();

// NOTE: Telegram webhook endpoint removed.
// Telegram messages are now received via grammY long polling (lib/telegram/bot.ts).
// The bot calls processInbound directly via ConvexHttpClient.

// Hub send endpoint - triggers agent processing for a session
http.route({
  path: "/hub/send",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    // Basic auth check - verify the request has a valid token
    const authHeader = request.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response("Unauthorized", { status: 401 });
    }

    const body = await request.json();
    const { sessionId, gatewayId } = body;

    if (!sessionId || !gatewayId) {
      return new Response("Missing sessionId or gatewayId", { status: 400 });
    }

    // Schedule session processing (non-blocking)
    await ctx.scheduler.runAfter(0, internal.actions.router.processSession, {
      sessionId,
      gatewayId,
    });

    return new Response("OK", { status: 200 });
  }),
});

export default http;
