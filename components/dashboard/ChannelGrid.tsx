"use client";

import { useFetch } from "@/lib/hooks";
import { formatRelativeTime } from "@/lib/utils";
import Link from "next/link";
import { Plus } from "lucide-react";

interface Channel {
  id: string;
  name: string;
  platform: string;
  isActive: boolean;
  lastActivity: number | null;
  messageCount?: number;
}

const platformStyles: Record<string, { icon: string; color: string }> = {
  telegram: { icon: "📱", color: "text-blue-400" },
  discord: { icon: "💬", color: "text-indigo-400" },
  web: { icon: "🌐", color: "text-cyan-400" },
  hub: { icon: "💬", color: "text-purple-400" },
};

export function ChannelGrid() {
  const { data: health } = useFetch<{ channels: Channel[] }>("/api/dashboard/health", 30000);
  const channels = health?.channels || [];

  return (
    <div className="bg-white/[0.04] backdrop-blur-2xl border border-white/[0.08] rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.3)] p-5">
      <h3 className="text-sm font-medium text-zinc-200 mb-1">Channels</h3>
      <p className="text-xs text-zinc-500 mb-4">Connected integrations</p>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {channels.map((ch) => {
          const style = platformStyles[ch.platform] || { icon: "📡", color: "text-zinc-400" };
          return (
            <Link
              key={ch.id}
              href={`/chat?channel=${ch.id}`}
              className="bg-white/[0.04] border border-white/[0.06] rounded-xl p-3 hover:bg-white/[0.08] hover:border-white/[0.12] transition-all group"
            >
              <div className="flex items-center gap-2 mb-2">
                <span className="text-lg">{style.icon}</span>
                <span className="text-xs font-medium text-zinc-300 truncate">{ch.name}</span>
              </div>
              <div className="flex items-center gap-1.5 mb-1">
                <span className={`w-1.5 h-1.5 rounded-full ${ch.isActive ? "bg-green-400 animate-pulse" : "bg-zinc-600"}`} />
                <span className="text-[10px] text-zinc-500">{ch.isActive ? "Connected" : "Offline"}</span>
              </div>
              {ch.lastActivity && (
                <p className="text-[10px] text-zinc-600">{formatRelativeTime(ch.lastActivity)}</p>
              )}
            </Link>
          );
        })}

        {/* Add Channel */}
        <Link
          href="/settings"
          className="bg-white/[0.02] border border-dashed border-white/[0.08] rounded-xl p-3 flex flex-col items-center justify-center gap-2 hover:bg-white/[0.06] hover:border-white/[0.12] transition-all min-h-[80px]"
        >
          <Plus className="w-5 h-5 text-zinc-600" />
          <span className="text-[10px] text-zinc-600">Add Channel</span>
        </Link>
      </div>
    </div>
  );
}
