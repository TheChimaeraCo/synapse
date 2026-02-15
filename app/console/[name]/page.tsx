"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useParams } from "next/navigation";
import {
  Search, ArrowDown, Pause, Play, Square, RotateCcw, Trash2, X,
} from "lucide-react";
import { gatewayFetch } from "@/lib/gatewayFetch";

interface PM2Process {
  name: string;
  pm2_env: { status: string; pm_uptime: number; restart_time: number };
  monit: { cpu: number; memory: number };
}

function colorLine(line: string) {
  const lower = line.toLowerCase();
  if (lower.includes("error") || lower.includes("err|") || lower.includes("fatal"))
    return "text-red-400";
  if (lower.includes("warn") || lower.includes("warning"))
    return "text-yellow-400";
  return "text-zinc-300";
}

function formatUptime(uptime: number) {
  const ms = Date.now() - uptime;
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ${mins % 60}m`;
  return `${Math.floor(hrs / 24)}d ${hrs % 24}h`;
}

function formatMem(bytes: number) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

const statusColors: Record<string, string> = {
  online: "bg-green-500/20 text-green-400 border-green-500/40",
  stopped: "bg-red-500/20 text-red-400 border-red-500/40",
  errored: "bg-yellow-500/20 text-yellow-400 border-yellow-500/40",
  launching: "bg-blue-500/20 text-blue-400 border-blue-500/40",
};

export default function ConsolePage() {
  const params = useParams();
  const processName = decodeURIComponent(params.name as string);

  const [logs, setLogs] = useState("");
  const [proc, setProc] = useState<PM2Process | null>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const [polling, setPolling] = useState(true);
  const [search, setSearch] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [acting, setActing] = useState(false);

  const fetchLogs = useCallback(async () => {
    try {
      const res = await gatewayFetch(`/api/pm2/logs?name=${encodeURIComponent(processName)}&lines=500`);
      const data = await res.json();
      setLogs(data.logs || "");
    } catch {}
  }, [processName]);

  const fetchProc = useCallback(async () => {
    try {
      const res = await gatewayFetch("/api/pm2");
      if (res.ok) {
        const procs: PM2Process[] = await res.json();
        const found = procs.find((p) => p.name === processName);
        if (found) setProc(found);
      }
    } catch {}
  }, [processName]);

  // Initial fetch
  useEffect(() => {
    fetchLogs();
    fetchProc();
  }, [fetchLogs, fetchProc]);

  // Polling
  useEffect(() => {
    if (!polling) return;
    const id = setInterval(() => {
      fetchLogs();
      fetchProc();
    }, 2500);
    return () => clearInterval(id);
  }, [polling, fetchLogs, fetchProc]);

  // Auto-scroll
  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  // Window title
  useEffect(() => {
    document.title = `${processName} - Console`;
  }, [processName]);

  const doAction = async (action: string) => {
    setActing(true);
    try {
      await gatewayFetch("/api/pm2", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, name: processName }),
      });
      await new Promise((r) => setTimeout(r, 1000));
      await fetchProc();
      await fetchLogs();
    } catch {} finally {
      setActing(false);
    }
  };

  const lines = logs.split("\n");
  const filtered = search
    ? lines.filter((l) => l.toLowerCase().includes(search.toLowerCase()))
    : lines;

  const status = proc?.pm2_env?.status || "unknown";

  return (
    <div className="h-screen w-screen flex flex-col bg-[#0a0a12] text-zinc-200 overflow-hidden"
      style={{ fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', 'Consolas', monospace" }}>
      
      {/* Top bar */}
      <div className="flex items-center gap-3 px-4 py-2 bg-white/[0.04] backdrop-blur-2xl border-b border-white/[0.08] shrink-0 select-none">
        {/* Process name + status */}
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-sm font-semibold text-zinc-100 truncate">{processName}</span>
          <span className={`text-[10px] px-1.5 py-0 rounded border ${statusColors[status] || "bg-white/[0.06] text-zinc-400 border-white/[0.08]"}`}>
            {status}
          </span>
        </div>

        {/* Stats */}
        {proc && (
          <div className="flex items-center gap-3 text-[11px] text-zinc-500 ml-2">
            <span>CPU <span className="text-zinc-300">{proc.monit?.cpu ?? 0}%</span></span>
            <span>MEM <span className="text-zinc-300">{formatMem(proc.monit?.memory || 0)}</span></span>
            {status === "online" && proc.pm2_env?.pm_uptime && (
              <span>UP <span className="text-zinc-300">{formatUptime(proc.pm2_env.pm_uptime)}</span></span>
            )}
            <span>RST <span className="text-zinc-300">{proc.pm2_env?.restart_time || 0}</span></span>
          </div>
        )}

        <div className="flex-1" />

        {/* Action buttons */}
        <div className="flex items-center gap-1">
          <button onClick={() => setShowSearch(!showSearch)} title="Search"
            className={`p-1.5 rounded hover:bg-white/10 transition-colors ${showSearch ? "text-blue-400" : "text-zinc-400"}`}>
            <Search className="w-3.5 h-3.5" />
          </button>
          <button onClick={() => setAutoScroll(!autoScroll)} title={autoScroll ? "Auto-scroll ON" : "Auto-scroll OFF"}
            className={`p-1.5 rounded hover:bg-white/10 transition-colors ${autoScroll ? "text-blue-400" : "text-zinc-400"}`}>
            <ArrowDown className="w-3.5 h-3.5" />
          </button>
          <button onClick={() => setPolling(!polling)} title={polling ? "Pause polling" : "Resume polling"}
            className={`p-1.5 rounded hover:bg-white/10 transition-colors ${polling ? "text-green-400" : "text-zinc-400"}`}>
            {polling ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
          </button>
          <button onClick={() => setLogs("")} title="Clear display"
            className="p-1.5 rounded text-zinc-400 hover:bg-white/10 hover:text-zinc-200 transition-colors">
            <Trash2 className="w-3.5 h-3.5" />
          </button>

          <div className="w-px h-4 bg-white/10 mx-1" />

          {status === "online" ? (
            <button onClick={() => doAction("stop")} disabled={acting} title="Stop"
              className="p-1.5 rounded text-zinc-400 hover:bg-red-500/20 hover:text-red-400 transition-colors disabled:opacity-50">
              <Square className="w-3.5 h-3.5" />
            </button>
          ) : (
            <button onClick={() => doAction("start")} disabled={acting} title="Start"
              className="p-1.5 rounded text-zinc-400 hover:bg-green-500/20 hover:text-green-400 transition-colors disabled:opacity-50">
              <Play className="w-3.5 h-3.5" />
            </button>
          )}
          <button onClick={() => doAction("restart")} disabled={acting} title="Restart"
            className="p-1.5 rounded text-zinc-400 hover:bg-blue-500/20 hover:text-blue-400 transition-colors disabled:opacity-50">
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Search bar */}
      {showSearch && (
        <div className="flex items-center gap-2 px-4 py-2 bg-white/[0.03] border-b border-white/[0.06] shrink-0">
          <Search className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
          <input
            autoFocus
            placeholder="Filter logs..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 bg-transparent text-sm text-zinc-200 outline-none placeholder:text-zinc-600"
            onKeyDown={(e) => { if (e.key === "Escape") { setShowSearch(false); setSearch(""); } }}
          />
          {search && (
            <span className="text-[10px] text-zinc-500">{filtered.length} matches</span>
          )}
          <button onClick={() => { setShowSearch(false); setSearch(""); }}
            className="p-1 rounded text-zinc-500 hover:text-zinc-300">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Log content */}
      <div ref={scrollRef} className="flex-1 overflow-auto p-2 text-xs leading-5 select-text">
        {filtered.map((line, i) => (
          <div key={i} className="flex gap-2 hover:bg-white/[0.03] px-1">
            <span className="text-zinc-600 select-none w-8 text-right shrink-0">{i + 1}</span>
            <span className={colorLine(line)} style={{ wordBreak: "break-all" }}>{line}</span>
          </div>
        ))}
      </div>

      {/* Status bar */}
      <div className="flex items-center justify-between px-4 py-1.5 bg-white/[0.03] border-t border-white/[0.06] text-[10px] text-zinc-500 shrink-0 select-none">
        <span>{filtered.length} lines{search ? ` (filtered from ${lines.length})` : ""}</span>
        <div className="flex items-center gap-3">
          {polling && <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" /> Live</span>}
          {autoScroll && <span>Auto-scroll</span>}
        </div>
      </div>
    </div>
  );
}
