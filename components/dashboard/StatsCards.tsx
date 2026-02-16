"use client";

import { MessageSquare, Users, Clock, DollarSign } from "lucide-react";
import { formatCost } from "@/lib/utils";

interface StatsData {
  messagesToday: number;
  messagesWeek: number;
  messagesMonth: number;
  activeSessions: number;
  avgResponseTime: number;
  costToday: number;
  costWeek: number;
  costMonth: number;
}

const cards = [
  {
    key: "messages",
    label: "MESSAGES TODAY",
    icon: MessageSquare,
    gradient: "from-blue-500/20 to-blue-600/5",
    iconColor: "text-blue-400/40",
    getValue: (s: StatsData) => String(s.messagesToday),
    getSub: (s: StatsData) => `${s.messagesWeek} this week`,
  },
  {
    key: "sessions",
    label: "ACTIVE SESSIONS",
    icon: Users,
    gradient: "from-purple-500/20 to-purple-600/5",
    iconColor: "text-purple-400/40",
    getValue: (s: StatsData) => String(s.activeSessions),
    getSub: () => "Currently active",
  },
  {
    key: "speed",
    label: "AVG RESPONSE",
    icon: Clock,
    gradient: "from-cyan-500/20 to-cyan-600/5",
    iconColor: "text-cyan-400/40",
    getValue: (s: StatsData) =>
      s.avgResponseTime > 0 ? `${(s.avgResponseTime / 1000).toFixed(1)}s` : "N/A",
    getSub: () => "All-time average",
  },
  {
    key: "cost",
    label: "COST TODAY",
    icon: DollarSign,
    gradient: "from-amber-500/20 to-amber-600/5",
    iconColor: "text-amber-400/40",
    getValue: (s: StatsData) => formatCost(s.costToday),
    getSub: (s: StatsData) => `${formatCost(s.costWeek)} this week`,
  },
];

export function StatsCards({ stats }: { stats: StatsData }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map((card) => {
        const Icon = card.icon;
        return (
          <div
            key={card.key}
            className={`relative overflow-hidden bg-white/[0.04] backdrop-blur-2xl border border-white/[0.08] rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.3)] p-5 hover:translate-y-[-2px] hover:shadow-[0_12px_40px_rgba(0,0,0,0.4)] transition-all duration-300 bg-gradient-to-br ${card.gradient}`}
          >
            <Icon className={`absolute -right-3 -top-3 w-24 h-24 ${card.iconColor}`} />
            <div className="relative z-10">
              <p className="text-xs uppercase tracking-wider text-zinc-500 font-medium mb-2">
                {card.label}
              </p>
              <p className="text-2xl sm:text-4xl font-bold text-white mb-1">
                {card.getValue(stats)}
              </p>
              <p className="text-xs text-zinc-400">{card.getSub(stats)}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function StatsCardsSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {[0, 1, 2, 3].map((i) => (
        <div
          key={i}
          className="bg-white/[0.04] backdrop-blur-2xl border border-white/[0.08] rounded-2xl p-5 h-32 animate-pulse"
        >
          <div className="h-3 w-24 bg-white/[0.08] rounded mb-4" />
          <div className="h-8 w-16 bg-white/[0.08] rounded mb-2" />
          <div className="h-3 w-20 bg-white/[0.06] rounded" />
        </div>
      ))}
    </div>
  );
}
