"use client";

import { Send as SendIcon, Globe, MessageCircle, Hash, Settings, Eye, History } from "lucide-react";
import { Button } from "@/components/ui/button";
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
}

export function ChannelHeader({ channel, isReadOnly, onToggleHistory, historyOpen }: ChannelHeaderProps) {
  if (!channel) return null;

  const badge = PLATFORM_BADGES[channel.platform] || PLATFORM_BADGES.custom;

  return (
    <div className="flex items-center gap-3 px-5 py-3 border-b border-white/[0.06] bg-white/[0.02] backdrop-blur-2xl shrink-0">
      <Hash className="h-5 w-5 text-zinc-400 shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-zinc-200 truncate">
            {channel.name}
          </span>
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
  );
}
