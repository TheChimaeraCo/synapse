"use client";

import Link from "next/link";
import { MessageSquarePlus, Radio, BookOpen } from "lucide-react";

const actions = [
  { label: "New Chat", href: "/chat", icon: MessageSquarePlus, desc: "Start a conversation" },
  { label: "New Channel", href: "/settings?tab=channels", icon: Radio, desc: "Connect a platform" },
  { label: "Upload Knowledge", href: "/knowledge", icon: BookOpen, desc: "Add to knowledge base" },
];

export function QuickActions() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      {actions.map((a) => (
        <Link
          key={a.href}
          href={a.href}
          className="group flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.04] backdrop-blur-xl px-4 py-3 transition hover:bg-white/[0.07] hover:border-white/20"
        >
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 text-white">
            <a.icon size={18} />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-zinc-100 group-hover:text-white">{a.label}</p>
            <p className="text-xs text-zinc-500">{a.desc}</p>
          </div>
        </Link>
      ))}
    </div>
  );
}
