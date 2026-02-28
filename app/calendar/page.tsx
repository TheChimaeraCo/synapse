"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { gatewayFetch } from "@/lib/gatewayFetch";
import { toast } from "sonner";
import { CalendarDays, Copy, Plus, RefreshCw, RotateCcw, Trash2 } from "lucide-react";

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
        setFeedUrl(data.feedUrl || "");
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
      setFeedUrl(data.feedUrl || "");
      toast.success("Feed URL rotated");
    } catch {
      toast.error("Failed to rotate feed URL");
    }
  };

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

          <div className="grid gap-6 lg:grid-cols-[1.1fr_1.4fr]">
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
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-400 mb-3">Events</h2>
              {loading ? (
                <p className="text-sm text-zinc-500">Loading events...</p>
              ) : upcoming.length === 0 ? (
                <p className="text-sm text-zinc-500">No events yet. Add one above or ask the agent to add one.</p>
              ) : (
                <div className="space-y-2">
                  {upcoming.map((event) => (
                    <div key={event.id} className="rounded-xl border border-white/[0.1] bg-black/20 p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-zinc-100 truncate">{event.title}</p>
                          <p className="text-xs text-zinc-400 mt-0.5">
                            {new Date(event.startAt).toLocaleString()} - {new Date(event.endAt).toLocaleString()}
                          </p>
                          {event.location && <p className="text-xs text-zinc-500 mt-1">Location: {event.location}</p>}
                          {event.description && <p className="text-xs text-zinc-500 mt-1 line-clamp-2">{event.description}</p>}
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
        </div>
      </div>
    </AppShell>
  );
}
