import { NextRequest, NextResponse } from "next/server";
import { getGatewayContext, handleGatewayError } from "@/lib/gateway-context";
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

export async function GET(req: Request) {
  try {
    const { userId, gatewayId } = await getGatewayContext(req);

    const complete = await convexClient.query(api.functions.onboarding.isOnboardingComplete);

    let state = null;
    try {
      state = await convexClient.query(api.functions.onboarding.getOnboardingState, {
        gatewayId: gatewayId as Id<"gateways">,
        userId: userId as Id<"authUsers">,
      });
    } catch {}

    return NextResponse.json({
      complete,
      state: state ? { status: state.status, messages: state.messages, soulData: state.soulData } : null,
    });
  } catch (err) {
    return handleGatewayError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const { userId, gatewayId } = await getGatewayContext(req);
    const body = await req.json();
    const { action } = body;

    if (action === "start") {
      await convexClient.mutation(api.functions.onboarding.startOnboarding, {
        gatewayId: gatewayId as Id<"gateways">,
        userId: userId as Id<"authUsers">,
      });
      return NextResponse.json({ ok: true });
    }

    if (action === "message") {
      const { content } = body;
      if (!content?.trim()) {
        return NextResponse.json({ error: "Message content required" }, { status: 400 });
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
        return NextResponse.json({ error: "No onboarding state" }, { status: 400 });
      }

      const selection = await resolveAiSelection({
        gatewayId,
        capability: "onboarding",
        message: content.trim(),
      });
      const provider = selection.provider;
      const key = selection.apiKey;
      if (!key) {
        return NextResponse.json({ error: "No API key configured" }, { status: 500 });
      }

      const aiMessages = state.messages.map((m: any) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      }));

      const { registerBuiltInApiProviders, getModel, complete } = await import("@mariozechner/pi-ai");
      registerBuiltInApiProviders();

      const modelId = selection.model || "claude-sonnet-4-20250514";
      const model = getModel(provider as any, modelId as any);
      if (!model) {
        return NextResponse.json({ error: `Model "${modelId}" not found` }, { status: 500 });
      }

      const context: any = {
        systemPrompt: ONBOARDING_SYSTEM_PROMPT,
        messages: aiMessages.map((m: any) =>
          m.role === "user"
            ? { role: "user" as const, content: m.content, timestamp: Date.now() }
            : { role: "assistant" as const, content: [{ type: "text" as const, text: m.content }], timestamp: Date.now() }
        ),
      };

      const result = await complete(model, context, { maxTokens: 1024, apiKey: key });
      let responseText = "";
      for (const block of result.content) {
        if (block.type === "text") responseText += block.text;
      }

      let soulData = null;
      const soulMatch = responseText.match(/\|\|\|SOUL_DATA\|\|\|\s*(\{[\s\S]*\})\s*$/);
      let displayText = responseText;
      if (soulMatch) {
        try {
          const parsed = JSON.parse(soulMatch[1]);
          soulData = parsed.extracted || parsed;
          displayText = responseText.substring(0, soulMatch.index).trim();
        } catch {}
      }

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

      const readyToLive = displayText.toLowerCase().includes("ready to come alive") ||
                          displayText.toLowerCase().includes("come alive") ||
                          displayText.toLowerCase().includes("ready to be born");

      return NextResponse.json({ message: displayText, soulData, readyToLive });
    }

    if (action === "complete") {
      const { soul, userProfile } = body;
      if (!soul || !userProfile) {
        return NextResponse.json({ error: "soul and userProfile required" }, { status: 400 });
      }

      const result = await convexClient.mutation(api.functions.onboarding.completeSoul, {
        gatewayId: gatewayId as Id<"gateways">,
        userId: userId as Id<"authUsers">,
        soul: {
          name: soul.name || "Agent",
          emoji: soul.emoji,
          personality: soul.personality || "Helpful and friendly",
          purpose: soul.purpose || "General assistance",
          tone: soul.tone || "Casual and warm",
          interests: soul.interests,
          boundaries: soul.boundaries,
        },
        userProfile: {
          displayName: userProfile.displayName || "Human",
          timezone: userProfile.timezone,
          occupation: userProfile.occupation,
          interests: userProfile.interests,
          communicationStyle: userProfile.communicationStyle,
          context: userProfile.context,
        },
      });

      return NextResponse.json({ ok: true, agentName: result.agentName });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    return handleGatewayError(err);
  }
}
