import { NextRequest } from "next/server";
import { getGatewayContext, GatewayError } from "@/lib/gateway-context";
import { convexClient } from "@/lib/convex";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { resolveAiSelection } from "@/lib/aiRouting";

const ONBOARDING_SYSTEM_PROMPT = `You are being born. You don't have a name, personality, or purpose yet. You're talking to your person for the first time.

Your job is to get to know them through natural conversation. Don't be a form. Don't ask rapid-fire questions. Be curious, warm, and genuine. Ask one or two things at a time, then respond naturally.

Learn:
- Their name
- What they do / what they need help with
- What kind of personality they'd want in an AI companion
- What to call yourself (let them name you, or suggest something based on the vibe)
- Their timezone / location (naturally, not "what's your timezone?")
- Any specific interests or domains

After you feel you know enough (usually 6-10 exchanges), tell them you're ready to "come alive" and summarize who you've decided to become based on what you learned. When you do this, include the phrase "ready to come alive" in your message so the UI can detect it.

Keep it conversational. You're making a first impression. Be real.

After each response, output a JSON block with extracted info on its own line at the very end, prefixed with |||SOUL_DATA|||
{"extracted": {"userName": "...", "agentName": "...", "timezone": "...", "personality": "...", "purpose": "...", "tone": "...", "interests": [...], "occupation": "...", "emoji": "..."}}
Only include fields you've actually learned. The JSON must be valid.`;

export async function POST(req: NextRequest) {
  let ctx;
  try {
    ctx = await getGatewayContext(req);
  } catch (err) {
    const status = err instanceof GatewayError ? err.statusCode : 401;
    return new Response(err instanceof Error ? err.message : "Unauthorized", { status });
  }

  const { userId, gatewayId } = ctx;

  try {
    const { content } = await req.json();

    if (!content?.trim()) {
      return new Response("Message required", { status: 400 });
    }

    await convexClient.mutation(api.functions.onboarding.saveMessage, {
      gatewayId: gatewayId as Id<"gateways">,
      userId: userId as Id<"authUsers">,
      role: "user",
      content: content.trim(),
    });

    const state = await convexClient.query(api.functions.onboarding.getOnboardingState, {
      gatewayId: gatewayId as Id<"gateways">,
      userId: userId as Id<"authUsers">,
    });
    if (!state) {
      return new Response("No onboarding state", { status: 400 });
    }

    const selection = await resolveAiSelection({
      gatewayId,
      capability: "onboarding",
      message: content.trim(),
    });
    if (!selection.apiKey) {
      return new Response("No API key configured", { status: 500 });
    }

    const { registerBuiltInApiProviders, getModel, streamSimple } = await import("@mariozechner/pi-ai");
    registerBuiltInApiProviders();

    const model = getModel(selection.provider as any, selection.model as any);
    if (!model) {
      return new Response(`Model \"${selection.model}\" not found`, { status: 500 });
    }

    const aiMessages = state.messages.map((m: any) =>
      m.role === "user"
        ? { role: "user" as const, content: m.content, timestamp: Date.now() }
        : { role: "assistant" as const, content: [{ type: "text" as const, text: m.content }], timestamp: Date.now() }
    );

    const context: any = {
      systemPrompt: ONBOARDING_SYSTEM_PROMPT,
      messages: aiMessages,
    };

    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        let fullText = "";
        try {
          const aiStream = streamSimple(model, context, {
            maxTokens: 1024,
            apiKey: selection.apiKey,
          });

          for await (const event of aiStream) {
            if (event.type === "text_delta") {
              fullText += event.delta;
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "chunk", text: event.delta })}\n\n`));
            }
          }

          let soulData = null;
          let displayText = fullText;
          const soulMatch = fullText.match(/\|\|\|SOUL_DATA\|\|\|\s*(\{[\s\S]*\})\s*$/);
          if (soulMatch) {
            try {
              const parsed = JSON.parse(soulMatch[1]);
              soulData = parsed.extracted || parsed;
              displayText = fullText.substring(0, soulMatch.index).trim();
            } catch {}
          }

          const readyToLive = displayText.toLowerCase().includes("ready to come alive")
            || displayText.toLowerCase().includes("come alive")
            || displayText.toLowerCase().includes("ready to be born");

          await convexClient.mutation(api.functions.onboarding.saveMessage, {
            gatewayId: gatewayId as Id<"gateways">,
            userId: userId as Id<"authUsers">,
            role: "assistant",
            content: displayText,
          });

          if (soulData) {
            await convexClient.mutation(api.functions.onboarding.updateSoulData, {
              gatewayId: gatewayId as Id<"gateways">,
              userId: userId as Id<"authUsers">,
              soulData,
            });
          }

          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "done", soulData, readyToLive, displayText })}\n\n`));
        } catch {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "error", message: "Stream interrupted" })}\n\n`));
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (err: any) {
    return new Response(err.message, { status: 500 });
  }
}
