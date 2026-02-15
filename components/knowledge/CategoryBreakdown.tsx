"use client";

import { useState, useEffect, useMemo } from "react";

interface KnowledgeEntry {
  _id: string;
  key: string;
  value: string;
  category?: string;
  confidence?: number;
}

const CATEGORY_COLORS: Record<string, string> = {
  preference: "#3b82f6",
  fact: "#a855f7",
  decision: "#f59e0b",
  action_item: "#22c55e",
  project: "#06b6d4",
  person: "#ec4899",
};

interface Props {
  entries: KnowledgeEntry[];
  selectedCategory: string | null;
  onSelectCategory: (cat: string | null) => void;
}

export function CategoryBreakdown({ entries, selectedCategory, onSelectCategory }: Props) {
  const [animated, setAnimated] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setAnimated(true), 200);
    return () => clearTimeout(t);
  }, []);

  const data = useMemo(() => {
    const counts = new Map<string, number>();
    for (const e of entries) {
      const cat = e.category || "other";
      counts.set(cat, (counts.get(cat) || 0) + 1);
    }
    return Array.from(counts.entries())
      .map(([name, count]) => ({
        name,
        count,
        pct: entries.length > 0 ? (count / entries.length) * 100 : 0,
        color: CATEGORY_COLORS[name] || "#71717a",
      }))
      .sort((a, b) => b.count - a.count);
  }, [entries]);

  const total = entries.length;
  const r = 60, strokeWidth = 12;
  const circumference = 2 * Math.PI * r;

  let offset = 0;
  const segments = data.map((d) => {
    const len = (d.count / Math.max(total, 1)) * circumference;
    const seg = { ...d, offset, len };
    offset += len;
    return seg;
  });

  return (
    <div className="bg-white/[0.04] backdrop-blur-2xl border border-white/[0.08] rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.3)] p-5">
      <div className="text-xs font-medium text-zinc-400 uppercase tracking-wider mb-4">Categories</div>

      <div className="flex flex-col items-center gap-4">
        {/* Donut */}
        <div className="relative">
          <svg width="160" height="160" viewBox="0 0 160 160">
            <circle cx="80" cy="80" r={r} fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth={strokeWidth} />
            {segments.map((seg, i) => (
              <circle
                key={seg.name}
                cx="80"
                cy="80"
                r={r}
                fill="none"
                stroke={seg.color}
                strokeWidth={selectedCategory === seg.name ? strokeWidth + 3 : strokeWidth}
                strokeDasharray={`${animated ? seg.len : 0} ${circumference}`}
                strokeDashoffset={-seg.offset}
                strokeLinecap="round"
                transform="rotate(-90 80 80)"
                style={{
                  transition: "stroke-dasharray 0.8s cubic-bezier(0.34, 1.56, 0.64, 1), stroke-width 0.2s ease",
                  transitionDelay: `${i * 100}ms`,
                  cursor: "pointer",
                  opacity: selectedCategory && selectedCategory !== seg.name ? 0.3 : 1,
                  filter: selectedCategory === seg.name ? `drop-shadow(0 0 6px ${seg.color})` : "none",
                }}
                onClick={() => onSelectCategory(selectedCategory === seg.name ? null : seg.name)}
              />
            ))}
          </svg>
          <div className="absolute inset-0 flex items-center justify-center flex-col">
            <span className="text-2xl font-bold text-zinc-200">{total}</span>
            <span className="text-[10px] text-zinc-500">entries</span>
          </div>
        </div>

        {/* Legend */}
        <div className="w-full space-y-1.5">
          {data.map((d) => (
            <button
              key={d.name}
              onClick={() => onSelectCategory(selectedCategory === d.name ? null : d.name)}
              className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs transition-all ${
                selectedCategory === d.name
                  ? "bg-white/[0.08]"
                  : "hover:bg-white/[0.04]"
              }`}
            >
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: d.color }} />
              <span className="text-zinc-300 capitalize flex-1 text-left">{d.name.replace(/_/g, " ")}</span>
              <span className="text-zinc-500 font-mono">{d.count}</span>
              <span className="text-zinc-600 font-mono w-10 text-right">{d.pct.toFixed(0)}%</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
