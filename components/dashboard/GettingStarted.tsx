"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { X, Sparkles, Settings, MessageSquare, Brain, Bot, CheckCircle2, Circle, Users, PartyPopper } from "lucide-react";

interface ChecklistItem {
  id: string;
  label: string;
  description: string;
  href: string;
  icon: React.ElementType;
}

const ITEMS: ChecklistItem[] = [
  { id: "provider", label: "Connect an AI provider", description: "Add your OpenAI, Anthropic, or other API key", href: "/settings", icon: Settings },
  { id: "personality", label: "Configure your agent's personality", description: "Give your AI a name, tone, and system prompt", href: "/settings", icon: Bot },
  { id: "channel", label: "Connect a channel", description: "Set up Discord, Telegram, or another integration", href: "/settings", icon: MessageSquare },
  { id: "message", label: "Send your first message", description: "Try chatting with your AI in the playground", href: "/chat", icon: MessageSquare },
  { id: "knowledge", label: "Add knowledge", description: "Teach your AI facts, preferences, or upload docs", href: "/knowledge", icon: Brain },
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

  if (dismissed) return null;

  const completed: Record<string, boolean> = {
    provider: !!hasProvider,
    channel: !!hasChannels,
    message: messageCount > 0,
    knowledge: !!hasKnowledge,
    personality: false,
  };

  const doneCount = Object.values(completed).filter(Boolean).length;
  const allDone = doneCount === ITEMS.length;

  // Auto-dismiss after celebrating
  const handleDismiss = () => {
    localStorage.setItem(LS_KEY, "true");
    setDismissed(true);
  };

  return (
    <div className="bg-white/[0.04] backdrop-blur-2xl border border-white/10 rounded-2xl p-5 relative overflow-hidden transition-all duration-500">
      {/* Decorative gradient */}
      <div className="absolute -top-20 -right-20 w-40 h-40 bg-gradient-to-br from-blue-500/20 to-purple-500/20 rounded-full blur-3xl pointer-events-none" />

      <div className="flex items-start justify-between mb-4 relative">
        <div className="flex items-center gap-2.5">
          <div className={`p-2 rounded-xl border border-white/10 transition-colors duration-500 ${
            allDone ? "bg-gradient-to-br from-emerald-500/20 to-emerald-600/20" : "bg-gradient-to-br from-blue-500/20 to-purple-500/20"
          }`}>
            {allDone ? <PartyPopper className="w-4 h-4 text-emerald-400" /> : <Sparkles className="w-4 h-4 text-blue-400" />}
          </div>
          <div>
            <h3 className="text-sm font-semibold text-zinc-100">
              {allDone ? "You're all set!" : "Getting Started"}
            </h3>
            <p className="text-xs text-zinc-500">{doneCount} of {ITEMS.length} complete</p>
          </div>
        </div>
        <button
          onClick={handleDismiss}
          className="text-zinc-500 hover:text-zinc-300 transition-colors"
          title="Dismiss"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Progress bar */}
      <div className="h-1.5 bg-white/[0.06] rounded-full mb-4 relative overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-700 ease-out ${
            allDone ? "bg-gradient-to-r from-emerald-500 to-emerald-400" : "bg-gradient-to-r from-blue-500 to-blue-600"
          }`}
          style={{ width: `${(doneCount / ITEMS.length) * 100}%` }}
        />
      </div>

      {allDone ? (
        <div className="text-center py-2">
          <p className="text-sm text-zinc-400 mb-3">Your gateway is ready to go. Happy building!</p>
          <button
            onClick={handleDismiss}
            className="px-4 py-1.5 rounded-xl text-xs font-medium bg-gradient-to-r from-blue-500 to-blue-600 text-white hover:brightness-110 transition-all"
          >
            Dismiss
          </button>
        </div>
      ) : (
        <div className="space-y-1.5 relative">
          {ITEMS.map((item) => {
            const done = completed[item.id];
            return (
              <Link
                key={item.id}
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-300 group ${
                  done
                    ? "bg-white/[0.02] text-zinc-500"
                    : "bg-white/[0.04] hover:bg-white/[0.07] text-zinc-300"
                }`}
              >
                <div className="shrink-0 transition-transform duration-300">
                  {done ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  ) : (
                    <Circle className="w-4 h-4 text-zinc-600 group-hover:text-zinc-400" />
                  )}
                </div>
                <div className="min-w-0">
                  <span className={`text-xs font-medium block ${done ? "line-through text-zinc-500" : ""}`}>{item.label}</span>
                  {!done && <span className="text-[10px] text-zinc-500 block">{item.description}</span>}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
