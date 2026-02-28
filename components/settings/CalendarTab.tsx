"use client";
import { gatewayFetch } from "@/lib/gatewayFetch";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { CalendarDays, Copy, ExternalLink, RefreshCw, RotateCcw } from "lucide-react";
import { toast } from "sonner";

interface CalendarEvent {
  id: string;
  title: string;
  startAt: number;
  endAt: number;
}

export function CalendarTab() {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [feedUrl, setFeedUrl] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [eventsRes, feedRes] = await Promise.all([
        gatewayFetch("/api/calendar/events"),
        gatewayFetch("/api/calendar/feed-token"),
      ]);
      if (eventsRes.ok) {
        const data = await eventsRes.json();
        setEvents((data.events || []).slice(0, 8));
      }
      if (feedRes.ok) {
        const data = await feedRes.json();
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

  const rotate = async () => {
    try {
      const res = await gatewayFetch("/api/calendar/feed-token", { method: "POST" });
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();
      setFeedUrl(data.feedUrl || "");
      toast.success("Calendar feed URL rotated");
    } catch {
      toast.error("Failed to rotate feed URL");
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-white flex items-center gap-2">
          <CalendarDays className="w-5 h-5" />
          Calendar
        </h2>
        <p className="text-sm text-zinc-400 mt-1">
          Subscribe via ICS and let agents add events automatically.
        </p>
      </div>

      <div className="rounded-xl border border-white/10 bg-white/[0.04] p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm text-zinc-300">Private calendar feed URL</p>
          <button onClick={() => void load()} className="text-zinc-400 hover:text-white">
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
        <div className="flex flex-col gap-2 md:flex-row">
          <input
            readOnly
            value={feedUrl}
            placeholder={loading ? "Loading..." : "No feed URL"}
            className="h-10 flex-1 rounded-xl border border-white/[0.12] bg-black/20 px-3 text-sm text-zinc-200"
          />
          <button
            onClick={() => navigator.clipboard.writeText(feedUrl).then(() => toast.success("Copied"))}
            disabled={!feedUrl}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.08] px-3 py-2 text-sm text-zinc-200 hover:bg-white/[0.12] disabled:opacity-50"
          >
            <Copy className="w-4 h-4" />
            Copy
          </button>
          <button
            onClick={rotate}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-amber-400/20 bg-amber-500/10 px-3 py-2 text-sm text-amber-200 hover:bg-amber-500/20"
          >
            <RotateCcw className="w-4 h-4" />
            Rotate
          </button>
          <Link
            href="/calendar"
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-cyan-300/20 bg-cyan-500/10 px-3 py-2 text-sm text-cyan-100 hover:bg-cyan-500/20"
          >
            <ExternalLink className="w-4 h-4" />
            Open Calendar
          </Link>
        </div>
        <p className="text-xs text-zinc-500">
          Google: Add calendar from URL. Outlook: Subscribe from web.
        </p>
      </div>

      <div className="rounded-xl border border-white/10 bg-white/[0.04] p-4">
        <p className="text-sm text-zinc-300 mb-2">Upcoming events ({events.length})</p>
        {loading ? (
          <p className="text-sm text-zinc-500">Loading...</p>
        ) : events.length === 0 ? (
          <p className="text-sm text-zinc-500">No events yet.</p>
        ) : (
          <div className="space-y-2">
            {events.map((event) => (
              <div key={event.id} className="rounded-lg border border-white/10 bg-black/20 px-3 py-2">
                <p className="text-sm text-zinc-200">{event.title}</p>
                <p className="text-xs text-zinc-500">
                  {new Date(event.startAt).toLocaleString()} - {new Date(event.endAt).toLocaleString()}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
