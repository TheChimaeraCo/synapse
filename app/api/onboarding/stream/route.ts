import { NextRequest } from "next/server";
import { getGatewayContext, GatewayError } from "@/lib/gateway-context";
import { convexClient } from "@/lib/convex";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

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

async function getGwConfig(gatewayId: string, key: string): Promise<string | null> {
  try {
    const result = await convexClient.query(api.functions.gatewayConfig.getWithInheritance, {
      gatewayId: gatewayId as Id<"gateways">, key,
    });
    return result?.value || null;
  } catch {
    return await convexClient.query(api.functions.config.get, { key });
  }
}

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

    const [providerSlug, apiKey, configModel] = await Promise.all([
      getGwConfig(gatewayId, "ai_provider"),
      getGwConfig(gatewayId, "ai_api_key"),
      getGwConfig(gatewayId, "ai_model"),
    ]);

    const provider = providerSlug || "anthropic";
    const key = apiKey || "";
    if (!key) {
      return new Response("No API key configured", { status: 500 });
    }

    const isSetupToken = key.startsWith("sk-ant-oat");
    const modelId = configModel || "claude-sonnet-4-20250514";

    const aiMessages = state.messages.map((m: any) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    }));

    const headers: Record<string, string> = {
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    };
    if (isSetupToken) {
      headers["authorization"] = `Bearer ${key}`;
      headers["anthropic-beta"] = "oauth-2025-04-20";
    } else {
      headers["x-api-key"] = key;
    }

    const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: modelId,
        max_tokens: 1024,
        system: ONBOARDING_SYSTEM_PROMPT,
        messages: aiMessages,
        stream: true,
      }),
    });

    if (!anthropicRes.ok || !anthropicRes.body) {
      const errText = await anthropicRes.text();
      return new Response(`AI error: ${anthropicRes.status} - ${errText}`, { status: 502 });
    }

    const encoder = new TextEncoder();
    const decoder = new TextDecoder();
    let fullText = "";

    const stream = new ReadableStream({
      async start(controller) {
        const reader = anthropicRes.body!.getReader();
        let buffer = "";

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() || "";

            for (const line of lines) {
              if (!line.startsWith("data: ")) continue;
              const data = line.slice(6).trim();
              if (data === "[DONE]") continue;

              try {
                const event = JSON.parse(data);
                if (event.type === "content_block_delta" && event.delta?.text) {
                  const chunk = event.delta.text;
                  fullText += chunk;
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "chunk", text: chunk })}\n\n`));
                }
                if (event.type === "message_stop") {
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

                  const readyToLive = displayText.toLowerCase().includes("ready to come alive") ||
                                      displayText.toLowerCase().includes("come alive") ||
                                      displayText.toLowerCase().includes("ready to be born");

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
                }
              } catch {}
            }
          }
        } catch (err) {
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
