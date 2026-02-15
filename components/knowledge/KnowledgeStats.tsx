"use client";

import { Database, Layers, Radio, TrendingUp, Clock } from "lucide-react";

interface KnowledgeEntry {
  _id: string;
  category?: string;
  source?: string;
  confidence?: number;
  updatedAt: number;
}

interface Props {
  entries: KnowledgeEntry[];
}

export function KnowledgeStats({ entries }: Props) {
  const categories = new Set(entries.map((e) => e.category || "other")).size;
  const sources = new Set(entries.map((e) => e.source || "unknown")).size;
  const avgConfidence = entries.length > 0
    ? entries.reduce((s, e) => s + (e.confidence ?? 0.5), 0) / entries.length
    : 0;
  const lastUpdated = entries.length > 0
    ? Math.max(...entries.map((e) => e.updatedAt))
    : 0;

  const stats = [
    { label: "Total Entries", value: entries.length, icon: Database },
    { label: "Categories", value: categories, icon: Layers },
    { label: "Sources", value: sources, icon: Radio },
    {
      label: "Avg Confidence",
      value: `${(avgConfidence * 100).toFixed(0)}%`,
      icon: TrendingUp,
      bar: avgConfidence,
    },
    {
      label: "Last Updated",
      value: lastUpdated > 0 ? new Date(lastUpdated).toLocaleDateString() : "-",
      icon: Clock,
    },
  ];

  return (
    <div className="bg-white/[0.04] backdrop-blur-2xl border border-white/[0.08] rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.3)] px-4 py-3">
      <div className="flex items-center gap-6 overflow-x-auto">
        {stats.map((s) => (
          <div key={s.label} className="flex items-center gap-2.5 shrink-0">
            <s.icon className="h-4 w-4 text-zinc-500" />
            <div>
              <div className="text-[10px] text-zinc-500 uppercase tracking-wider">{s.label}</div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-zinc-200">{s.value}</span>
                {s.bar !== undefined && (
                  <div className="w-16 h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-red-500 via-yellow-500 to-green-500"
                      style={{ width: `${s.bar * 100}%`, transition: "width 0.5s ease" }}
                    />
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
