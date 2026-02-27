"use client";

import Link from "next/link";
import { MessageSquarePlus, Radio, BookOpen, Sparkles } from "lucide-react";

const actions = [
  { label: "New Chat", href: "/chat", icon: MessageSquarePlus, desc: "Start a conversation" },
  { label: "New Channel", href: "/settings?tab=channels", icon: Radio, desc: "Connect a platform" },
  { label: "Upload Knowledge", href: "/knowledge", icon: BookOpen, desc: "Add to knowledge base" },
  { label: "Autonomy", href: "/settings?tab=autonomy", icon: Sparkles, desc: "Tune autonomous execution" },
];

export function QuickActions() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
      {actions.map((a) => (
        <Link
          key={a.href}
          href={a.href}
          className="group flex items-center gap-3 rounded-xl border border-white/[0.12] bg-white/[0.045] backdrop-blur-xl px-4 py-3 transition hover:bg-white/[0.09] hover:border-cyan-300/30 hover:translate-y-[-1px]"
        >
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-cyan-500 to-emerald-500 text-white shadow-[0_10px_20px_rgba(6,182,212,0.25)]">
            <a.icon size={18} />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-zinc-100 group-hover:text-white">{a.label}</p>
            <p className="text-xs text-zinc-400">{a.desc}</p>
          </div>
        </Link>
      ))}
    </div>
  );
}
