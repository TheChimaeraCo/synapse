"use client";

import { useState, useEffect, useRef } from "react";
import { useFetch } from "@/lib/hooks";
import { formatRelativeTime } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Search, X, Tag } from "lucide-react";

interface ConversationsSidebarProps {
  open: boolean;
  onClose: () => void;
  sessionId: string | null;
  onSelectConversation: (conversationId: string, startSeq?: number) => void;
}

export function ConversationsSidebar({
  open,
  onClose,
  sessionId,
  onSelectConversation,
}: ConversationsSidebarProps) {
  const [search, setSearch] = useState("");
  const sidebarRef = useRef<HTMLDivElement>(null);

  const url = sessionId
    ? `/api/conversations?sessionId=${sessionId}&limit=50`
    : null;
  const { data } = useFetch<{ conversations: any[] }>(url, 5000);
  const conversations = data?.conversations;

  const filtered = conversations?.filter((c: any) => {
    if (!search) return true;
    const text = [c.title || "", c.summary || "", ...(c.tags || []), ...(c.topics || [])].join(" ").toLowerCase();
    return text.includes(search.toLowerCase());
  });

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (sidebarRef.current && !sidebarRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const timer = setTimeout(() => document.addEventListener("mousedown", handler), 50);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("mousedown", handler);
    };
  }, [open, onClose]);

  const touchStart = useRef<number | null>(null);
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStart.current = e.touches[0].clientX;
  };
  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStart.current !== null) {
      const diff = e.changedTouches[0].clientX - touchStart.current;
      if (diff > 80) onClose();
      touchStart.current = null;
    }
  };

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
          onClick={onClose}
        />
      )}

      <div
        ref={sidebarRef}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        className={`fixed inset-y-0 right-0 z-50 w-[calc(100vw-3rem)] sm:w-[340px] max-w-[340px] transform transition-transform duration-300 ease-out bg-white/[0.05] backdrop-blur-3xl border-l border-white/[0.08] flex flex-col shadow-[0_16px_64px_rgba(0,0,0,0.4)] ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
          <span className="text-sm font-semibold text-zinc-100 tracking-tight">Conversations</span>
          <Button variant="ghost" size="icon" className="h-7 w-7 text-zinc-400 hover:text-zinc-200" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Search */}
        <div className="p-3">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-zinc-500" />
            <input
              type="text"
              placeholder="Search conversations..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-xl bg-white/[0.04] border border-white/[0.08] py-2.5 pl-8 pr-3 text-xs text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-blue-500/30 focus:ring-1 focus:ring-blue-500/20 transition-all"
            />
          </div>
        </div>

        {/* Conversations list */}
        <ScrollArea className="flex-1">
          <div className="flex flex-col gap-0.5 px-2 pb-2">
            {!filtered ? (
              Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-14 rounded-xl bg-white/5 animate-pulse mx-1" />
              ))
            ) : filtered.length === 0 ? (
              <p className="px-3 py-6 text-xs text-zinc-500 text-center">
                {search ? "No matching conversations" : "No conversations yet"}
              </p>
            ) : (
              filtered.map((c: any) => {
                const tags = c.tags || c.topics || [];
                const seqRange = c.startSeq && c.endSeq ? `#${c.startSeq}-${c.endSeq}` : "";
                return (
                  <button
                    key={c._id}
                    onClick={() => { onSelectConversation(c._id, c.startSeq); onClose(); }}
                    className="flex flex-col rounded-xl px-3 py-2.5 text-left transition-all w-full hover:bg-white/10 border border-transparent hover:border-white/10"
                  >
                    <span className="truncate text-sm font-medium text-zinc-200">
                      {c.title || "Untitled"}
                    </span>
                    {c.summary && (
                      <span className="truncate text-xs text-zinc-500 mt-0.5">
                        {c.summary}
                      </span>
                    )}
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <span className="text-[10px] text-zinc-600">
                        {formatRelativeTime(c.lastMessageAt)}
                      </span>
                      {seqRange && (
                        <span className="text-[10px] text-zinc-600 font-mono">{seqRange}</span>
                      )}
                      {c.status === "active" && (
                        <span className="text-[10px] text-emerald-400">active</span>
                      )}
                      {tags.slice(0, 3).map((tag: string) => (
                        <span key={tag} className="text-[10px] text-blue-400/60 flex items-center gap-0.5">
                          <Tag className="h-2.5 w-2.5" />{tag}
                        </span>
                      ))}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </ScrollArea>
      </div>
    </>
  );
}
