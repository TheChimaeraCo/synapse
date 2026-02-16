"use client";

import { useState } from "react";
import { Hash, Plus, Send as SendIcon, Globe, MessageCircle, Radio, X, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ChannelDisplay } from "@/lib/types";

const PLATFORM_ICONS: Record<string, React.ReactNode> = {
  telegram: <SendIcon className="h-4 w-4 text-sky-400" />,
  hub: <Globe className="h-4 w-4 text-emerald-400" />,
  discord: <MessageCircle className="h-4 w-4 text-indigo-400" />,
  whatsapp: <MessageCircle className="h-4 w-4 text-green-400" />,
  api: <Zap className="h-4 w-4 text-amber-400" />,
  custom: <Hash className="h-4 w-4 text-zinc-400" />,
};

interface ChannelSidebarProps {
  channels: ChannelDisplay[];
  activeChannelId: string | null;
  onSelectChannel: (channelId: string) => void;
  onCreateChannel?: () => void;
  open: boolean;
  onClose: () => void;
}

export function ChannelSidebar({
  channels,
  activeChannelId,
  onSelectChannel,
  onCreateChannel,
  open,
  onClose,
}: ChannelSidebarProps) {
  const platformChannels = channels.filter(
    (c) => c.platform !== "custom" && c.platform !== "api"
  );
  const apiChannels = channels.filter(
    (c) => c.platform === "api"
  );
  const customChannels = channels.filter(
    (c) => c.platform === "custom"
  );

  const sidebarContent = (
    <div className="flex flex-col h-full bg-white/[0.03] backdrop-blur-2xl border-r border-white/[0.06]">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
        <div className="flex items-center gap-2">
          <Radio className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold text-zinc-200">Channels</span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 text-zinc-500 hover:text-zinc-300 lg:hidden"
          onClick={onClose}
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto py-2">
        {/* Platforms section */}
        {platformChannels.length > 0 && (
          <div className="mb-3">
            <div className="px-4 py-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                Platforms
              </span>
            </div>
            {platformChannels.map((ch) => (
              <ChannelItem
                key={ch._id}
                channel={ch}
                active={ch._id === activeChannelId}
                onClick={() => onSelectChannel(ch._id)}
              />
            ))}
          </div>
        )}

        {/* API section */}
        {apiChannels.length > 0 && (
          <div className="mb-3">
            <div className="px-4 py-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                API
              </span>
            </div>
            {apiChannels.map((ch) => (
              <ChannelItem
                key={ch._id}
                channel={ch}
                active={ch._id === activeChannelId}
                onClick={() => onSelectChannel(ch._id)}
              />
            ))}
          </div>
        )}

        {/* Custom section */}
        <div>
          <div className="px-4 py-1 flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
              Custom
            </span>
            {onCreateChannel && (
              <button
                onClick={onCreateChannel}
                className="text-zinc-500 hover:text-zinc-300 transition-colors"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          {customChannels.map((ch) => (
            <ChannelItem
              key={ch._id}
              channel={ch}
              active={ch._id === activeChannelId}
              onClick={() => onSelectChannel(ch._id)}
            />
          ))}
          {customChannels.length === 0 && (
            <div className="px-4 py-2">
              <span className="text-xs text-zinc-600 italic">No custom channels</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <div className="hidden lg:block w-[240px] shrink-0 h-full">
        {sidebarContent}
      </div>

      {/* Mobile overlay */}
      {open && (
        <>
          <div
            className="fixed inset-0 bg-black/50 z-40 lg:hidden"
            onClick={onClose}
          />
          <div className="fixed inset-y-0 left-0 w-[240px] z-50 lg:hidden">
            {sidebarContent}
          </div>
        </>
      )}
    </>
  );
}

function ChannelItem({
  channel,
  active,
  onClick,
}: {
  channel: ChannelDisplay;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-2 px-3 py-1.5 mx-1 rounded text-sm transition-colors ${
        active
          ? "bg-white/10 text-zinc-100"
          : "text-zinc-400 hover:text-zinc-200 hover:bg-white/5"
      }`}
    >
      <span className="shrink-0">
        {channel.icon ? (
          <span className="text-sm">{channel.icon}</span>
        ) : (
          PLATFORM_ICONS[channel.platform] || <Hash className="h-4 w-4" />
        )}
      </span>
      <span className="truncate">
        {channel.name}
      </span>
    </button>
  );
}
