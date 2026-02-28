"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { gatewayFetch } from "@/lib/gatewayFetch";
import { toast } from "sonner";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Copy,
  MapPin,
  Plus,
  RefreshCw,
  RotateCcw,
  Trash2,
} from "lucide-react";

interface CalendarEvent {
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

function toLocalInput(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromLocalInput(value: string): number | null {
  if (!value) return null;
  const ts = Date.parse(value);
  return Number.isFinite(ts) ? ts : null;
}

function dayKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function monthGrid(monthDate: Date): Date[] {
  const first = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
  const offset = first.getDay();
  const start = new Date(first);
  start.setDate(first.getDate() - offset);
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
}

function normalizeFeedUrl(input: string): string {
  if (!input) return "";
  try {
    const url = new URL(input);
    if (
      typeof window !== "undefined" &&
      (url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "0.0.0.0")
    ) {
      const origin = window.location.origin;
      return `${origin}${url.pathname}${url.search}${url.hash}`;
    }
    return url.toString();
  } catch {
    return input;
  }
}

export default function CalendarPage() {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [feedUrl, setFeedUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [title, setTitle] = useState("");
  const [startAt, setStartAt] = useState(() => toLocalInput(Date.now() + 30 * 60 * 1000));
  const [endAt, setEndAt] = useState(() => toLocalInput(Date.now() + 90 * 60 * 1000));
  const [location, setLocation] = useState("");
  const [description, setDescription] = useState("");
  const [visibleMonth, setVisibleMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [selectedDay, setSelectedDay] = useState(() => new Date());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [eventsRes, tokenRes] = await Promise.all([
        gatewayFetch("/api/calendar/events"),
        gatewayFetch("/api/calendar/feed-token"),
      ]);
      if (eventsRes.ok) {
        const data = await eventsRes.json();
        setEvents(Array.isArray(data.events) ? data.events : []);
      }
      if (tokenRes.ok) {
        const data = await tokenRes.json();
        setFeedUrl(normalizeFeedUrl(data.feedUrl || ""));
      }
    } catch {
      toast.error("Failed to load calendar");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const upcoming = useMemo(
    () => [...events].sort((a, b) => a.startAt - b.startAt),
    [events],
  );
  const gridDays = useMemo(() => monthGrid(visibleMonth), [visibleMonth]);
  const eventsByDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const event of upcoming) {
      const key = dayKey(new Date(event.startAt));
      const list = map.get(key) || [];
      list.push(event);
      map.set(key, list);
    }
    return map;
  }, [upcoming]);
  const selectedDayEvents = useMemo(
    () => eventsByDay.get(dayKey(selectedDay)) || [],
    [eventsByDay, selectedDay],
  );
  const todayKey = dayKey(new Date());

  const createEvent = async () => {
    const start = fromLocalInput(startAt);
    const end = fromLocalInput(endAt);
    if (!title.trim() || start == null || end == null) {
      toast.error("Title, start, and end are required");
      return;
    }
    setSaving(true);
    try {
      const res = await gatewayFetch("/api/calendar/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          startAt: start,
          endAt: end,
          location: location.trim() || undefined,
          description: description.trim() || undefined,
        }),
      });
      if (!res.ok) throw new Error("Failed");
      setTitle("");
      setLocation("");
      setDescription("");
      toast.success("Event added");
      await load();
    } catch {
      toast.error("Failed to create event");
    } finally {
      setSaving(false);
    }
  };

  const deleteEvent = async (id: string) => {
    try {
      const res = await gatewayFetch(`/api/calendar/events/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed");
      setEvents((prev) => prev.filter((event) => event.id !== id));
      toast.success("Event deleted");
    } catch {
      toast.error("Failed to delete event");
    }
  };

  const rotateFeed = async () => {
    try {
      const res = await gatewayFetch("/api/calendar/feed-token", { method: "POST" });
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();
      setFeedUrl(normalizeFeedUrl(data.feedUrl || ""));
      toast.success("Feed URL rotated");
    } catch {
      toast.error("Failed to rotate feed URL");
    }
  };

  const selectDay = (date: Date) => {
    setSelectedDay(date);
    const start = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 10, 0, 0, 0).getTime();
    const end = start + 60 * 60 * 1000;
    setStartAt(toLocalInput(start));
    setEndAt(toLocalInput(end));
  };

  const monthLabel = visibleMonth.toLocaleDateString(undefined, { month: "long", year: "numeric" });

  return (
    <AppShell title="Calendar">
      <div className="h-full overflow-auto p-4 lg:p-6">
        <div className="mx-auto max-w-6xl space-y-6">
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h1 className="text-xl font-semibold text-zinc-100 flex items-center gap-2">
                  <CalendarDays className="h-5 w-5 text-cyan-300" />
                  Shared Calendar Feed
                </h1>
                <p className="text-sm text-zinc-400 mt-1">
                  Subscribe this private URL in Google Calendar, Outlook, Apple Calendar, or any ICS client.
                </p>
              </div>
              <button
                onClick={() => void load()}
                className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.05] px-3 py-2 text-xs text-zinc-300 hover:bg-white/[0.1]"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Refresh
              </button>
            </div>
            <div className="mt-4 flex flex-col gap-2 md:flex-row">
              <input
                readOnly
                value={feedUrl}
                className="h-10 flex-1 rounded-xl border border-white/[0.12] bg-black/20 px-3 text-sm text-zinc-200"
                placeholder={loading ? "Loading feed URL..." : "No feed URL"}
              />
              <button
                onClick={() => navigator.clipboard.writeText(feedUrl).then(() => toast.success("Feed URL copied"))}
                disabled={!feedUrl}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2 text-sm text-zinc-200 hover:bg-white/[0.1] disabled:opacity-50"
              >
                <Copy className="h-4 w-4" />
                Copy URL
              </button>
              <button
                onClick={rotateFeed}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-amber-400/20 bg-amber-400/10 px-3 py-2 text-sm text-amber-200 hover:bg-amber-400/20"
              >
                <RotateCcw className="h-4 w-4" />
                Rotate URL
              </button>
            </div>
            <div className="mt-3 text-xs text-zinc-500">
              Google: <span className="text-zinc-300">Settings → Add calendar → From URL</span> | Outlook: <span className="text-zinc-300">Add calendar → Subscribe from web</span>
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-[1.2fr_1.8fr]">
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5 space-y-3">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-400">Add Event</h2>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Event title"
                className="h-10 w-full rounded-xl border border-white/[0.12] bg-black/20 px-3 text-sm text-zinc-200"
              />
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <input
                  type="datetime-local"
                  value={startAt}
                  onChange={(e) => setStartAt(e.target.value)}
                  className="h-10 rounded-xl border border-white/[0.12] bg-black/20 px-3 text-sm text-zinc-200"
                />
                <input
                  type="datetime-local"
                  value={endAt}
                  onChange={(e) => setEndAt(e.target.value)}
                  className="h-10 rounded-xl border border-white/[0.12] bg-black/20 px-3 text-sm text-zinc-200"
                />
              </div>
              <input
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="Location (optional)"
                className="h-10 w-full rounded-xl border border-white/[0.12] bg-black/20 px-3 text-sm text-zinc-200"
              />
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Description (optional)"
                rows={4}
                className="w-full rounded-xl border border-white/[0.12] bg-black/20 px-3 py-2 text-sm text-zinc-200"
              />
              <button
                onClick={createEvent}
                disabled={saving}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-cyan-300/20 bg-cyan-500/10 px-3 py-2 text-sm text-cyan-100 hover:bg-cyan-500/20 disabled:opacity-60"
              >
                <Plus className="h-4 w-4" />
                {saving ? "Adding..." : "Add Event"}
              </button>

              <div className="pt-3 border-t border-white/10">
                <p className="text-xs uppercase tracking-wider text-zinc-500 mb-2">
                  {selectedDay.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
                </p>
                {selectedDayEvents.length === 0 ? (
                  <p className="text-xs text-zinc-500">No events on this day.</p>
                ) : (
                  <div className="space-y-2 max-h-[260px] overflow-auto pr-1">
                    {selectedDayEvents.map((event) => (
                      <div key={event.id} className="rounded-lg border border-white/10 bg-black/20 px-3 py-2">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-sm text-zinc-100 truncate">{event.title}</p>
                            <p className="text-xs text-zinc-400 flex items-center gap-1 mt-0.5">
                              <Clock3 className="h-3 w-3" />
                              {new Date(event.startAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })} - {new Date(event.endAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                            </p>
                            {event.location && (
                              <p className="text-xs text-zinc-500 flex items-center gap-1 mt-0.5">
                                <MapPin className="h-3 w-3" />
                                {event.location}
                              </p>
                            )}
                          </div>
                          <button
                            onClick={() => deleteEvent(event.id)}
                            className="shrink-0 rounded-lg border border-red-400/20 bg-red-500/10 p-1.5 text-red-200 hover:bg-red-500/20"
                            title="Delete event"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-400">Month View</h2>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setVisibleMonth((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1))}
                    className="rounded-lg border border-white/10 bg-white/[0.05] p-1.5 text-zinc-300 hover:bg-white/[0.1]"
                    title="Previous month"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <p className="text-sm text-zinc-200 min-w-[150px] text-center">{monthLabel}</p>
                  <button
                    onClick={() => setVisibleMonth((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1))}
                    className="rounded-lg border border-white/10 bg-white/[0.05] p-1.5 text-zinc-300 hover:bg-white/[0.1]"
                    title="Next month"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-7 gap-1 mb-1">
                {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
                  <div key={day} className="px-2 py-1 text-[11px] uppercase tracking-wider text-zinc-500">
                    {day}
                  </div>
                ))}
              </div>

              {loading ? (
                <p className="text-sm text-zinc-500">Loading events...</p>
              ) : (
                <div className="grid grid-cols-7 gap-1">
                  {gridDays.map((date) => {
                    const key = dayKey(date);
                    const dayEvents = eventsByDay.get(key) || [];
                    const isCurrentMonth = date.getMonth() === visibleMonth.getMonth();
                    const isToday = key === todayKey;
                    const isSelected = key === dayKey(selectedDay);
                    return (
                      <button
                        key={key}
                        onClick={() => selectDay(date)}
                        className={[
                          "relative min-h-[104px] rounded-xl border p-2 text-left transition",
                          isSelected
                            ? "border-cyan-300/50 bg-cyan-500/10"
                            : "border-white/10 bg-black/20 hover:bg-white/[0.04]",
                          !isCurrentMonth ? "opacity-45" : "",
                        ].join(" ")}
                      >
                        <div className="flex items-center justify-between">
                          <span
                            className={[
                              "text-xs",
                              isToday ? "rounded-full bg-cyan-500/20 px-2 py-0.5 text-cyan-200" : "text-zinc-300",
                            ].join(" ")}
                          >
                            {date.getDate()}
                          </span>
                          {dayEvents.length > 0 && (
                            <span className="text-[10px] text-zinc-400">{dayEvents.length}</span>
                          )}
                        </div>
                        <div className="mt-1.5 space-y-1">
                          {dayEvents.slice(0, 3).map((event) => (
                            <div
                              key={event.id}
                              className="truncate rounded bg-cyan-400/12 px-1.5 py-0.5 text-[10px] text-cyan-100"
                              title={event.title}
                            >
                              {event.title}
                            </div>
                          ))}
                          {dayEvents.length > 3 && (
                            <div className="text-[10px] text-zinc-400">+{dayEvents.length - 3} more</div>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}

              {!loading && upcoming.length === 0 && (
                <div className="mt-4 rounded-xl border border-dashed border-white/10 bg-black/20 p-4 text-sm text-zinc-500">
                  No events yet. Add one on the left or ask the agent to create one.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
