"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { X, Sparkles, Settings, MessageSquare, Brain, Bot, CheckCircle2, Circle } from "lucide-react";

interface ChecklistItem {
  id: string;
  label: string;
  href: string;
  icon: React.ElementType;
  check?: (data: any) => boolean;
}

const ITEMS: ChecklistItem[] = [
  { id: "provider", label: "Configure AI provider", href: "/settings", icon: Settings },
  { id: "channel", label: "Create first channel", href: "/settings", icon: MessageSquare },
  { id: "message", label: "Send first message", href: "/chat", icon: MessageSquare },
  { id: "knowledge", label: "Add knowledge entry", href: "/knowledge", icon: Brain },
  { id: "personality", label: "Set up agent personality", href: "/settings", icon: Bot },
];

const LS_KEY = "synapse_getting_started_dismissed";

interface GettingStartedProps {
  messageCount?: number;
  hasProvider?: boolean;
  hasChannels?: boolean;
  hasKnowledge?: boolean;
}

export function GettingStarted({ messageCount = 0, hasProvider, hasChannels, hasKnowledge }: GettingStartedProps) {
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    setDismissed(localStorage.getItem(LS_KEY) === "true");
  }, []);

  if (dismissed || messageCount >= 5) return null;

  const completed: Record<string, boolean> = {
    provider: !!hasProvider,
    channel: !!hasChannels,
    message: messageCount > 0,
    knowledge: !!hasKnowledge,
    personality: false,
  };

  const doneCount = Object.values(completed).filter(Boolean).length;

  return (
    <div className="bg-white/[0.04] backdrop-blur-2xl border border-white/10 rounded-2xl p-5 relative overflow-hidden">
      {/* Decorative gradient */}
      <div className="absolute -top-20 -right-20 w-40 h-40 bg-gradient-to-br from-blue-500/20 to-purple-500/20 rounded-full blur-3xl pointer-events-none" />

      <div className="flex items-start justify-between mb-4 relative">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-gradient-to-br from-blue-500/20 to-purple-500/20 border border-white/10">
            <Sparkles className="w-4 h-4 text-blue-400" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-zinc-100">Getting Started</h3>
            <p className="text-xs text-zinc-500">{doneCount}/{ITEMS.length} complete</p>
          </div>
        </div>
        <button
          onClick={() => { localStorage.setItem(LS_KEY, "true"); setDismissed(true); }}
          className="text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Progress bar */}
      <div className="h-1 bg-white/[0.06] rounded-full mb-4 relative">
        <div
          className="h-full bg-gradient-to-r from-blue-500 to-blue-600 rounded-full transition-all duration-500"
          style={{ width: `${(doneCount / ITEMS.length) * 100}%` }}
        />
      </div>

      <div className="space-y-2 relative">
        {ITEMS.map((item) => {
          const done = completed[item.id];
          return (
            <Link
              key={item.id}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2 rounded-xl transition-colors ${
                done
                  ? "bg-white/[0.02] text-zinc-500"
                  : "bg-white/[0.04] hover:bg-white/[0.07] text-zinc-300"
              }`}
            >
              {done ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              ) : (
                <Circle className="w-4 h-4 text-zinc-600 shrink-0" />
              )}
              <item.icon className="w-3.5 h-3.5 shrink-0 opacity-50" />
              <span className={`text-xs ${done ? "line-through" : ""}`}>{item.label}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
