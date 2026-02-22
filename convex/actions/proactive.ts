"use node";

import { internalAction } from "../_generated/server";
import { api, internal } from "../_generated/api";

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function parseBool(value: unknown, fallback = false): boolean {
  const v = clean(value).toLowerCase();
  if (!v) return fallback;
  if (v === "1" || v === "true" || v === "yes" || v === "on") return true;
  if (v === "0" || v === "false" || v === "no" || v === "off") return false;
  return fallback;
}

function parseIntOr(value: unknown, fallback: number): number {
  const n = Number.parseInt(clean(value), 10);
  return Number.isFinite(n) ? n : fallback;
}

function parseClock(value: string, fallback: string): string {
  const s = clean(value) || fallback;
  if (!/^\d{2}:\d{2}$/.test(s)) return fallback;
  const [hh, mm] = s.split(":").map((x) => Number.parseInt(x, 10));
  if (!Number.isFinite(hh) || !Number.isFinite(mm) || hh < 0 || hh > 23 || mm < 0 || mm > 59) {
    return fallback;
  }
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

function localTimeParts(timestamp: number, timeZone: string): { hour: number; minute: number; dateKey: string } {
  const date = new Date(timestamp);
  let dtf: Intl.DateTimeFormat;
  try {
    dtf = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  } catch {
    dtf = new Intl.DateTimeFormat("en-CA", {
      timeZone: "UTC",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  }
  const parts = dtf.formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value || "";
  const year = get("year");
  const month = get("month");
  const day = get("day");
  const hour = Number.parseInt(get("hour"), 10) || 0;
  const minute = Number.parseInt(get("minute"), 10) || 0;
  return {
    hour,
    minute,
    dateKey: `${year}-${month}-${day}`,
  };
}

function isQuietNow(now: number, timezone: string, quietStart: string, quietEnd: string): boolean {
  const [startH, startM] = quietStart.split(":").map((x) => Number.parseInt(x, 10));
  const [endH, endM] = quietEnd.split(":").map((x) => Number.parseInt(x, 10));
  const start = startH * 60 + startM;
  const end = endH * 60 + endM;
  const local = localTimeParts(now, timezone);
  const current = local.hour * 60 + local.minute;

  if (start === end) return false;
  if (start < end) return current >= start && current < end;
  return current >= start || current < end; // overnight range
}

function normalizeAllowedPlatforms(raw: string): Set<string> {
  const parts = (raw || "")
    .split(",")
    .map((p) => p.trim().toLowerCase())
    .filter(Boolean);
  if (parts.length === 0) return new Set(["hub", "telegram", "whatsapp", "api", "custom"]);
  return new Set(parts);
}

function parseExternalUserId(externalUserId: string | undefined, platform: "telegram" | "whatsapp"): string {
  const raw = clean(externalUserId);
  if (!raw) return "";
  if (raw.startsWith(`${platform}:`)) return raw.slice(platform.length + 1);
  return raw;
}

async function getGatewayValue(ctx: any, gatewayId: string, key: string): Promise<string> {
  try {
    const res = await ctx.runQuery(api.functions.gatewayConfig.getWithInheritance as any, {
      gatewayId,
      key,
    });
    return clean(res?.value);
  } catch {
    return "";
  }
}

async function sendWhatsAppMessage(ctx: any, gatewayId: string, to: string, text: string): Promise<void> {
  const [phoneNumberId, accessToken] = await Promise.all([
    getGatewayValue(ctx, gatewayId, "whatsapp_phone_number_id"),
    getGatewayValue(ctx, gatewayId, "whatsapp_access_token"),
  ]);
  if (!phoneNumberId || !accessToken) throw new Error("WhatsApp config missing");

  const res = await fetch(`https://graph.facebook.com/v21.0/${phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "text",
      text: { body: text },
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`WhatsApp send failed (${res.status}) ${body.slice(0, 180)}`);
  }
}

function buildFollowupMessage(prompt: string): string {
  const text = clean(prompt);
  if (!text) return "Quick follow-up: how did that go?";
  return text;
}

export const tick = internalAction({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const gateways: Array<{ _id: string }> = await ctx.runQuery(api.functions.gateways.list as any, {});
    let processed = 0;
    let sent = 0;
    let failed = 0;

    for (const gateway of gateways) {
      const [
        enabledRaw,
        modeRaw,
        maxPerDayRaw,
        cooldownHoursRaw,
        quietStartRaw,
        quietEndRaw,
        timezoneRaw,
        allowedPlatformsRaw,
      ] = await Promise.all([
        getGatewayValue(ctx, gateway._id, "proactive.enabled"),
        getGatewayValue(ctx, gateway._id, "proactive.mode"),
        getGatewayValue(ctx, gateway._id, "proactive.max_messages_per_day"),
        getGatewayValue(ctx, gateway._id, "proactive.min_hours_between"),
        getGatewayValue(ctx, gateway._id, "proactive.quiet_hours_start"),
        getGatewayValue(ctx, gateway._id, "proactive.quiet_hours_end"),
        getGatewayValue(ctx, gateway._id, "proactive.timezone"),
        getGatewayValue(ctx, gateway._id, "proactive.allowed_platforms"),
      ]);

      const enabled = parseBool(enabledRaw, false);
      const mode = clean(modeRaw) || "followups_only";
      if (!enabled || mode === "off") continue;

      const timezone = timezoneRaw || "UTC";
      const quietStart = parseClock(quietStartRaw, "22:00");
      const quietEnd = parseClock(quietEndRaw, "08:00");
      if (isQuietNow(now, timezone, quietStart, quietEnd)) continue;

      const maxPerDay = Math.max(1, Math.min(20, parseIntOr(maxPerDayRaw, 2)));
      const cooldownHours = Math.max(1, Math.min(48, parseIntOr(cooldownHoursRaw, 8)));
      const cooldownCutoff = now - cooldownHours * 60 * 60 * 1000;
      const allowedPlatforms = normalizeAllowedPlatforms(allowedPlatformsRaw);
      const todayKey = localTimeParts(now, timezone).dateKey;

      const due: Array<any> = await ctx.runQuery((api as any).functions.proactive.listDueByGateway, {
        gatewayId: gateway._id,
        now,
        limit: 30,
      });

      for (const followup of due) {
        processed += 1;
        try {
          const session = await ctx.runQuery(api.functions.sessions.get as any, { id: followup.sessionId });
          if (!session) {
            await ctx.runMutation((api as any).functions.proactive.markFailed, {
              id: followup._id,
              error: "Session not found",
            });
            failed += 1;
            continue;
          }
          const channel = session.channelId
            ? await ctx.runQuery(api.functions.channels.get as any, { id: session.channelId })
            : null;
          const platform = clean(channel?.platform).toLowerCase() || "hub";
          if (!allowedPlatforms.has(platform)) continue;

          const recent: Array<{ sentAt: number; status: string }> = await ctx.runQuery((api as any).functions.proactive.getSessionRecentSent, {
            sessionId: followup.sessionId,
            since: now - 7 * 24 * 60 * 60 * 1000,
            limit: 120,
          });
          const sentToday = recent.filter((r) => localTimeParts(r.sentAt, timezone).dateKey === todayKey).length;
          const lastSentAt = recent.reduce((max, r) => Math.max(max, r.sentAt || 0), 0);
          if (sentToday >= maxPerDay) continue;
          if (lastSentAt > 0 && lastSentAt >= cooldownCutoff) continue;

          const outboundText = buildFollowupMessage(followup.prompt);

          if (platform === "telegram") {
            const chatId = parseExternalUserId(followup.externalUserId || session.externalUserId, "telegram");
            if (!chatId) throw new Error("Missing telegram user id");
            await ctx.runAction(internal.actions.telegram.sendMessage as any, {
              chatId,
              text: outboundText,
            });
          } else if (platform === "whatsapp") {
            const to = parseExternalUserId(followup.externalUserId || session.externalUserId, "whatsapp");
            if (!to) throw new Error("Missing whatsapp user id");
            await sendWhatsAppMessage(ctx, gateway._id, to, outboundText);
          }

          const proactiveMessageId = await ctx.runMutation(api.functions.messages.create as any, {
            gatewayId: session.gatewayId,
            sessionId: followup.sessionId,
            agentId: session.agentId,
            role: "assistant",
            content: outboundText,
            conversationId: followup.conversationId,
            metadata: {
              source: "proactive_followup",
              proactive: true,
              proactiveFollowupId: String(followup._id),
              topic: followup.topic,
            },
          });

          await ctx.runMutation((api as any).functions.proactive.markSent, {
            id: followup._id,
            proactiveMessageId,
            sentAt: now,
          });
          sent += 1;
        } catch (err: any) {
          await ctx.runMutation((api as any).functions.proactive.markFailed, {
            id: followup._id,
            error: clean(err?.message || String(err) || "send failed").slice(0, 500),
          });
          failed += 1;
        }
      }
    }

    return { processed, sent, failed };
  },
});
