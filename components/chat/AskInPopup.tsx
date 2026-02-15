"use client";

import { useEffect, useRef } from "react";
import { Hash, MessageSquare } from "lucide-react";
import type { ChannelDisplay } from "@/lib/types";

interface AskInPopupProps {
  x: number;
  y: number;
  text: string;
  channels: ChannelDisplay[];
  onSelect: (channelId: string) => void;
  onClose: () => void;
}

export function AskInPopup({ x, y, text, channels, onSelect, onClose }: AskInPopupProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const timer = setTimeout(() => document.addEventListener("mousedown", handler), 50);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("mousedown", handler);
    };
  }, [onClose]);

  // Clamp position to viewport
  const popupWidth = 200;
  const clampedX = Math.min(Math.max(x - popupWidth / 2, 8), window.innerWidth - popupWidth - 8);
  const clampedY = Math.max(y - 8, 8);

  return (
    <div
      ref={ref}
      className="fixed z-[100] animate-in fade-in zoom-in-95 duration-150"
      style={{ left: clampedX, top: clampedY, transform: "translateY(-100%)" }}
    >
      <div className="rounded-xl border border-white/[0.12] bg-white/[0.07] backdrop-blur-3xl shadow-[0_16px_64px_rgba(0,0,0,0.4)] overflow-hidden min-w-[180px]">
        {/* Header */}
        <div className="px-3 py-2.5 border-b border-white/[0.08]">
          <div className="flex items-center gap-1.5 text-xs font-medium text-zinc-300">
            <MessageSquare className="h-3 w-3 text-blue-400" />
            Ask in...
          </div>
          <p className="text-[10px] text-zinc-500 mt-0.5 truncate max-w-[200px]">
            "{text.slice(0, 60)}{text.length > 60 ? "..." : ""}"
          </p>
        </div>

        {/* Channel list */}
        <div className="py-1">
          {channels.length === 0 ? (
            <p className="px-3 py-2 text-xs text-zinc-500">No channels available</p>
          ) : (
            channels.map((ch) => (
              <button
                key={ch._id}
                onClick={() => onSelect(ch._id)}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-sm text-zinc-300 hover:bg-white/10 transition-colors"
              >
                <Hash className="h-3.5 w-3.5 text-zinc-500" />
                <span className="truncate">{ch.name}</span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
