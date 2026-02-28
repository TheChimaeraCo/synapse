import { randomBytes, randomUUID } from "crypto";
import { convexClient } from "@/lib/convex";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

export const CALENDAR_EVENTS_KEY = "calendar.events";
export const CALENDAR_FEED_TOKEN_KEY = "calendar.feed_token";
const MAX_EVENTS = 2000;

export interface CalendarEvent {
  id: string;
  title: string;
  description?: string;
  location?: string;
  startAt: number;
  endAt: number;
  allDay?: boolean;
  source?: "agent" | "user" | "api";
  createdAt: number;
  updatedAt: number;
}

function cleanString(value: unknown, max = 500): string | undefined {
  if (typeof value !== "string") return undefined;
  const out = value.trim();
  if (!out) return undefined;
  return out.slice(0, max);
}

function toTimestamp(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return Math.floor(value);
  if (typeof value === "string" && value.trim()) {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function normalizeEvent(raw: any): CalendarEvent | null {
  if (!raw || typeof raw !== "object") return null;
  const id = cleanString(raw.id, 80);
  const title = cleanString(raw.title, 200);
  const startAt = toTimestamp(raw.startAt);
  const endAt = toTimestamp(raw.endAt);
  if (!id || !title || startAt == null || endAt == null) return null;
  if (endAt <= startAt) return null;

  return {
    id,
    title,
    description: cleanString(raw.description, 3000),
    location: cleanString(raw.location, 250),
    startAt,
    endAt,
    allDay: !!raw.allDay,
    source: raw.source === "agent" || raw.source === "api" ? raw.source : "user",
    createdAt: toTimestamp(raw.createdAt) || Date.now(),
    updatedAt: toTimestamp(raw.updatedAt) || Date.now(),
  };
}

function parseEvents(raw: string | null | undefined): CalendarEvent[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => normalizeEvent(item))
      .filter((item): item is CalendarEvent => !!item)
      .sort((a, b) => a.startAt - b.startAt)
      .slice(-MAX_EVENTS);
  } catch {
    return [];
  }
}

export function parseCalendarTimestamp(value: unknown): number | null {
  return toTimestamp(value);
}

export async function getCalendarEvents(
  gatewayId: Id<"gateways"> | string,
): Promise<CalendarEvent[]> {
  const raw = await convexClient.query(api.functions.gatewayConfig.get, {
    gatewayId: gatewayId as Id<"gateways">,
    key: CALENDAR_EVENTS_KEY,
  }).catch(() => null);
  return parseEvents(raw || undefined);
}

export async function setCalendarEvents(
  gatewayId: Id<"gateways"> | string,
  events: CalendarEvent[],
): Promise<void> {
  const normalized = events
    .map((e) => normalizeEvent(e))
    .filter((e): e is CalendarEvent => !!e)
    .sort((a, b) => a.startAt - b.startAt)
    .slice(-MAX_EVENTS);

  await convexClient.mutation(api.functions.gatewayConfig.set, {
    gatewayId: gatewayId as Id<"gateways">,
    key: CALENDAR_EVENTS_KEY,
    value: JSON.stringify(normalized),
  });
}

export async function addCalendarEvent(
  gatewayId: Id<"gateways"> | string,
  input: {
    title: string;
    startAt: number;
    endAt: number;
    allDay?: boolean;
    location?: string;
    description?: string;
    source?: "agent" | "user" | "api";
  },
): Promise<CalendarEvent> {
  const now = Date.now();
  const event: CalendarEvent = {
    id: randomUUID(),
    title: cleanString(input.title, 200) || "Untitled Event",
    startAt: Math.floor(input.startAt),
    endAt: Math.floor(input.endAt),
    allDay: !!input.allDay,
    location: cleanString(input.location, 250),
    description: cleanString(input.description, 3000),
    source: input.source || "user",
    createdAt: now,
    updatedAt: now,
  };
  if (event.endAt <= event.startAt) {
    event.endAt = event.startAt + 60 * 60 * 1000;
  }

  const events = await getCalendarEvents(gatewayId);
  events.push(event);
  await setCalendarEvents(gatewayId, events);
  return event;
}

export async function updateCalendarEvent(
  gatewayId: Id<"gateways"> | string,
  id: string,
  patch: Partial<Omit<CalendarEvent, "id" | "createdAt" | "source">>,
): Promise<CalendarEvent | null> {
  const events = await getCalendarEvents(gatewayId);
  const idx = events.findIndex((e) => e.id === id);
  if (idx === -1) return null;
  const current = events[idx];
  const updated: CalendarEvent = {
    ...current,
    ...(patch.title !== undefined ? { title: cleanString(patch.title, 200) || current.title } : {}),
    ...(patch.description !== undefined ? { description: cleanString(patch.description, 3000) } : {}),
    ...(patch.location !== undefined ? { location: cleanString(patch.location, 250) } : {}),
    ...(patch.startAt !== undefined && Number.isFinite(patch.startAt) ? { startAt: Math.floor(patch.startAt) } : {}),
    ...(patch.endAt !== undefined && Number.isFinite(patch.endAt) ? { endAt: Math.floor(patch.endAt) } : {}),
    ...(patch.allDay !== undefined ? { allDay: !!patch.allDay } : {}),
    updatedAt: Date.now(),
  };
  if (updated.endAt <= updated.startAt) {
    updated.endAt = updated.startAt + 60 * 60 * 1000;
  }
  events[idx] = updated;
  await setCalendarEvents(gatewayId, events);
  return updated;
}

export async function removeCalendarEvent(
  gatewayId: Id<"gateways"> | string,
  id: string,
): Promise<boolean> {
  const events = await getCalendarEvents(gatewayId);
  const next = events.filter((e) => e.id !== id);
  if (next.length === events.length) return false;
  await setCalendarEvents(gatewayId, next);
  return true;
}

export async function getCalendarFeedToken(
  gatewayId: Id<"gateways"> | string,
): Promise<string | null> {
  const token = await convexClient.query(api.functions.gatewayConfig.get, {
    gatewayId: gatewayId as Id<"gateways">,
    key: CALENDAR_FEED_TOKEN_KEY,
  }).catch(() => null);
  return cleanString(token, 200) || null;
}

function newFeedToken(): string {
  return randomBytes(24).toString("base64url");
}

export async function ensureCalendarFeedToken(
  gatewayId: Id<"gateways"> | string,
): Promise<string> {
  const existing = await getCalendarFeedToken(gatewayId);
  if (existing) return existing;
  const token = newFeedToken();
  await convexClient.mutation(api.functions.gatewayConfig.set, {
    gatewayId: gatewayId as Id<"gateways">,
    key: CALENDAR_FEED_TOKEN_KEY,
    value: token,
  });
  return token;
}

export async function rotateCalendarFeedToken(
  gatewayId: Id<"gateways"> | string,
): Promise<string> {
  const token = newFeedToken();
  await convexClient.mutation(api.functions.gatewayConfig.set, {
    gatewayId: gatewayId as Id<"gateways">,
    key: CALENDAR_FEED_TOKEN_KEY,
    value: token,
  });
  return token;
}
