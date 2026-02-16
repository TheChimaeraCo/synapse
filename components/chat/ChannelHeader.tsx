"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Send as SendIcon, Globe, MessageCircle, Hash, Settings, Eye, History, Search, X, Pencil, Trash2, Pin, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { gatewayFetch } from "@/lib/gatewayFetch";
import { formatRelativeTime } from "@/lib/utils";
import type { ChannelDisplay } from "@/lib/types";

const PLATFORM_BADGES: Record<string, { label: string; color: string }> = {
  telegram: { label: "Telegram", color: "bg-sky-500/20 text-sky-300" },
  hub: { label: "Web", color: "bg-emerald-500/20 text-emerald-300" },
  discord: { label: "Discord", color: "bg-indigo-500/20 text-indigo-300" },
  whatsapp: { label: "WhatsApp", color: "bg-green-500/20 text-green-300" },
  custom: { label: "Custom", color: "bg-white/[0.06] text-zinc-300" },
};

interface ChannelHeaderProps {
  channel: ChannelDisplay | null;
  isReadOnly?: boolean;
  onToggleHistory?: () => void;
  historyOpen?: boolean;
  sessionId?: string | null;
  onSessionRenamed?: () => void;
  onSessionDeleted?: () => void;
}

function SessionSearchOverlay({ onClose }: { onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<NodeJS.Timeout>();

  useEffect(() => { inputRef.current?.focus(); }, []);

  useEffect(() => {
    if (!query.trim()) { setResults([]); return; }
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await gatewayFetch(`/api/sessions?search=${encodeURIComponent(query)}&limit=20`);
        if (res.ok) {
          const data = await res.json();
          setResults(Array.isArray(data) ? data : data.sessions || []);
        }
      } catch {} finally { setSearching(false); }
    }, 300);
    return () => clearTimeout(debounceRef.current);
  }, [query]);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh]">
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg rounded-2xl border border-white/[0.12] bg-white/[0.07] backdrop-blur-3xl shadow-[0_16px_64px_rgba(0,0,0,0.4)] overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-white/[0.08]">
          <Search className="h-4 w-4 text-zinc-400 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            placeholder="Search sessions..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Escape" && onClose()}
            className="flex-1 bg-transparent text-sm text-zinc-200 placeholder:text-zinc-500 focus:outline-none"
          />
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="max-h-80 overflow-y-auto">
          {searching && <div className="px-4 py-3 text-xs text-zinc-500">Searching...</div>}
          {!searching && query && results.length === 0 && (
            <div className="px-4 py-6 text-xs text-zinc-500 text-center">No sessions found</div>
          )}
          {results.map((s: any) => (
            <a
              key={s._id}
              href={`/chat/${s._id}`}
              className="flex flex-col px-4 py-2.5 hover:bg-white/[0.06] transition-colors border-b border-white/[0.04] last:border-0"
            >
              <span className="text-sm text-zinc-200 truncate">{s.title || `Session ${s._id.slice(-6)}`}</span>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-[10px] text-zinc-500">{formatRelativeTime(s.lastMessageAt)}</span>
                <span className="text-[10px] text-zinc-600">{s.messageCount} messages</span>
                {s.lastMessagePreview && (
                  <span className="text-[10px] text-zinc-600 truncate max-w-[200px]">{s.lastMessagePreview}</span>
                )}
              </div>
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}

function PinnedMessagesPanel({ sessionId, onClose }: { sessionId: string; onClose: () => void }) {
  const [pins, setPins] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await gatewayFetch(`/api/sessions/${sessionId}/pins`);
        if (res.ok) {
          const data = await res.json();
          setPins(data.pins || []);
        }
      } catch {} finally { setLoading(false); }
    })();
  }, [sessionId]);

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-50" onClick={onClose} />
      <div className="fixed top-0 right-0 h-full w-80 z-50 border-l border-white/[0.1] bg-white/[0.04] backdrop-blur-3xl shadow-[0_0_64px_rgba(0,0,0,0.3)] flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.08]">
          <div className="flex items-center gap-2">
            <Pin className="h-4 w-4 text-yellow-400" />
            <span className="text-sm font-semibold text-zinc-200">Pinned Messages</span>
          </div>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300"><X className="h-4 w-4" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-3 space-y-3">
          {loading && <div className="text-xs text-zinc-500 text-center py-4">Loading...</div>}
          {!loading && pins.length === 0 && <div className="text-xs text-zinc-500 text-center py-8">No pinned messages</div>}
          {pins.map((pin: any) => (
            <div key={pin._id} className="rounded-xl border border-white/[0.08] bg-white/[0.04] p-3">
              <div className="text-[10px] text-zinc-500 mb-1">{pin.message?.role === "user" ? "You" : "Assistant"}</div>
              <p className="text-xs text-zinc-300 line-clamp-4 whitespace-pre-wrap">{pin.message?.content}</p>
              {pin.note && <p className="text-[10px] text-yellow-400/70 mt-1">Note: {pin.note}</p>}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

function ExportMenu({ sessionId, onClose }: { sessionId: string; onClose: () => void }) {
  const handleExport = (format: "md" | "json") => {
    window.open(`/api/sessions/${sessionId}/export?format=${format}`, "_blank");
    onClose();
  };

  return (
    <div className="absolute right-0 top-full mt-1 z-20 w-40 rounded-xl border border-white/[0.12] bg-white/[0.07] backdrop-blur-3xl shadow-lg overflow-hidden">
      <button onClick={() => handleExport("md")} className="w-full text-left px-3 py-2 text-xs text-zinc-300 hover:bg-white/[0.06] transition-colors">Export as Markdown</button>
      <button onClick={() => handleExport("json")} className="w-full text-left px-3 py-2 text-xs text-zinc-300 hover:bg-white/[0.06] transition-colors">Export as JSON</button>
    </div>
  );
}

export function ChannelHeader({ channel, isReadOnly, onToggleHistory, historyOpen, sessionId, onSessionRenamed, onSessionDeleted }: ChannelHeaderProps) {
  const [showSearch, setShowSearch] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showPins, setShowPins] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const editRef = useRef<HTMLInputElement>(null);
  const exportRef = useRef<HTMLDivElement>(null);

  // Close export menu on outside click
  useEffect(() => {
    if (!showExport) return;
    const handler = (e: MouseEvent) => {
      if (exportRef.current && !exportRef.current.contains(e.target as Node)) setShowExport(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showExport]);

  useEffect(() => { if (editing) editRef.current?.focus(); }, [editing]);

  // Keyboard shortcut: Cmd/Ctrl+K for search
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setShowSearch(true);
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  const handleRename = useCallback(async () => {
    if (!sessionId || !editTitle.trim()) { setEditing(false); return; }
    try {
      await gatewayFetch(`/api/sessions/${sessionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: editTitle.trim() }),
      });
      onSessionRenamed?.();
    } catch {}
    setEditing(false);
  }, [sessionId, editTitle, onSessionRenamed]);

  const handleDelete = useCallback(async () => {
    if (!sessionId) return;
    try {
      await gatewayFetch(`/api/sessions/${sessionId}`, { method: "DELETE" });
      onSessionDeleted?.();
    } catch {}
    setShowDeleteConfirm(false);
  }, [sessionId, onSessionDeleted]);

  if (!channel) return null;
  const badge = PLATFORM_BADGES[channel.platform] || PLATFORM_BADGES.custom;

  return (
    <>
      <div className="flex items-center gap-3 px-5 py-3 border-b border-white/[0.06] bg-white/[0.02] backdrop-blur-2xl shrink-0">
        <Hash className="h-5 w-5 text-zinc-400 shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            {editing ? (
              <input
                ref={editRef}
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleRename(); if (e.key === "Escape") setEditing(false); }}
                onBlur={handleRename}
                className="text-sm font-semibold text-zinc-200 bg-white/[0.06] border border-white/[0.15] rounded-lg px-2 py-0.5 focus:outline-none focus:border-blue-500/40 w-48"
              />
            ) : (
              <span
                className="text-sm font-semibold text-zinc-200 truncate cursor-pointer hover:text-white transition-colors"
                onDoubleClick={() => { setEditTitle(channel.name); setEditing(true); }}
                title="Double-click to rename"
              >
                {channel.name}
              </span>
            )}
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${badge.color}`}>
              {badge.label}
            </span>
            {isReadOnly && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-amber-500/20 text-amber-300 flex items-center gap-1">
                <Eye className="h-3 w-3" />
                Read Only
              </span>
            )}
          </div>
          {channel.description && (
            <p className="text-xs text-zinc-500 truncate mt-0.5">{channel.description}</p>
          )}
        </div>

        <div className="flex items-center gap-1">
          {sessionId && (
            <>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-zinc-500 hover:text-zinc-300"
                onClick={() => { setEditTitle(channel.name); setEditing(true); }}
                title="Rename session"
              >
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-zinc-500 hover:text-red-400"
                onClick={() => setShowDeleteConfirm(true)}
                title="Delete session"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </>
          )}
          {sessionId && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-zinc-500 hover:text-yellow-400"
              onClick={() => setShowPins(true)}
              title="Pinned messages"
            >
              <Pin className="h-3.5 w-3.5" />
            </Button>
          )}
          {sessionId && (
            <div ref={exportRef} className="relative">
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-zinc-500 hover:text-zinc-300"
                onClick={() => setShowExport(!showExport)}
                title="Export conversation"
              >
                <Download className="h-3.5 w-3.5" />
              </Button>
              {showExport && <ExportMenu sessionId={sessionId} onClose={() => setShowExport(false)} />}
            </div>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-zinc-400 hover:text-zinc-200"
            onClick={() => setShowSearch(true)}
            title="Search sessions (Ctrl+K)"
          >
            <Search className="h-4 w-4" />
          </Button>
          {onToggleHistory && (
            <Button
              variant="ghost"
              size="icon"
              className={`h-8 w-8 shrink-0 ${historyOpen ? "text-blue-400 bg-blue-500/10" : "text-zinc-400 hover:text-zinc-200"}`}
              onClick={onToggleHistory}
              title="Conversation history"
            >
              <History className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {showSearch && <SessionSearchOverlay onClose={() => setShowSearch(false)} />}
      {showPins && sessionId && <PinnedMessagesPanel sessionId={sessionId} onClose={() => setShowPins(false)} />}

      {showDeleteConfirm && (
        <>
          <div className="fixed inset-0 bg-black/50 z-50" onClick={() => setShowDeleteConfirm(false)} />
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-80 rounded-2xl border border-white/[0.12] bg-white/[0.07] backdrop-blur-3xl p-6 shadow-[0_16px_64px_rgba(0,0,0,0.4)]">
            <h3 className="text-sm font-semibold text-zinc-200 mb-2">Delete Session?</h3>
            <p className="text-xs text-zinc-400 mb-4">This will permanently delete this session and all its messages. This cannot be undone.</p>
            <div className="flex gap-2 justify-end">
              <Button variant="ghost" size="sm" onClick={() => setShowDeleteConfirm(false)} className="text-zinc-400">Cancel</Button>
              <Button size="sm" onClick={handleDelete} className="bg-red-600 hover:bg-red-500 text-white">Delete</Button>
            </div>
          </div>
        </>
      )}
    </>
  );
}
