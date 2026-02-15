"use client";

import { useState, useEffect, useMemo, useRef } from "react";

interface KnowledgeEntry {
  _id: string;
  key: string;
  value: string;
  category?: string;
  source?: string;
  confidence?: number;
  createdAt: number;
  updatedAt: number;
}

const CATEGORY_COLORS: Record<string, { bg: string; glow: string; text: string }> = {
  preference: { bg: "#3b82f6", glow: "rgba(59,130,246,0.4)", text: "text-blue-400" },
  fact: { bg: "#a855f7", glow: "rgba(168,85,247,0.4)", text: "text-purple-400" },
  decision: { bg: "#f59e0b", glow: "rgba(245,158,11,0.4)", text: "text-amber-400" },
  action_item: { bg: "#22c55e", glow: "rgba(34,197,94,0.4)", text: "text-green-400" },
  project: { bg: "#06b6d4", glow: "rgba(6,182,212,0.4)", text: "text-cyan-400" },
  person: { bg: "#ec4899", glow: "rgba(236,72,153,0.4)", text: "text-pink-400" },
};

const DEFAULT_COLOR = { bg: "#71717a", glow: "rgba(113,113,122,0.4)", text: "text-zinc-400" };

function getColor(category?: string) {
  return (category && CATEGORY_COLORS[category]) || DEFAULT_COLOR;
}

interface Props {
  entries: KnowledgeEntry[];
  onSelect?: (entry: KnowledgeEntry) => void;
  selectedId?: string | null;
}

export function KnowledgeGraph({ entries, onSelect, selectedId }: Props) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [animated, setAnimated] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = setTimeout(() => setAnimated(true), 100);
    return () => clearTimeout(t);
  }, []);

  const layout = useMemo(() => {
    const categories = new Map<string, KnowledgeEntry[]>();
    for (const e of entries) {
      const cat = e.category || "other";
      if (!categories.has(cat)) categories.set(cat, []);
      categories.get(cat)!.push(e);
    }

    const catList = Array.from(categories.entries());
    const cx = 200, cy = 200;
    const outerR = 150;
    const nodes: Array<{ entry: KnowledgeEntry; x: number; y: number; r: number; color: ReturnType<typeof getColor>; cat: string }> = [];

    catList.forEach(([cat, items], ci) => {
      const segAngleStart = (ci / catList.length) * Math.PI * 2 - Math.PI / 2;
      const segAngleEnd = ((ci + 1) / catList.length) * Math.PI * 2 - Math.PI / 2;
      const color = getColor(cat);

      items.forEach((entry, ei) => {
        const t = items.length === 1 ? 0.5 : ei / (items.length - 1);
        const angle = segAngleStart + t * (segAngleEnd - segAngleStart);
        const dist = 50 + (entry.confidence ?? 0.5) * (outerR - 50);
        const x = cx + Math.cos(angle) * dist;
        const y = cy + Math.sin(angle) * dist;
        const r = 4 + (entry.confidence ?? 0.5) * 8;
        nodes.push({ entry, x, y, r, color, cat });
      });
    });

    return { nodes, cx, cy };
  }, [entries]);

  const hovered = layout.nodes.find((n) => n.entry._id === hoveredId);

  return (
    <div
      ref={containerRef}
      className="relative bg-white/[0.04] backdrop-blur-2xl border border-white/[0.08] rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.3)] overflow-hidden"
      style={{ minHeight: 360 }}
    >
      <div className="absolute top-4 left-4 text-xs font-medium text-zinc-400 uppercase tracking-wider">
        Knowledge Graph
      </div>
      <svg viewBox="0 0 400 400" className="w-full h-full" style={{ minHeight: 340 }}>
        <defs>
          {layout.nodes.map((n) => (
            <radialGradient key={`g-${n.entry._id}`} id={`glow-${n.entry._id}`}>
              <stop offset="0%" stopColor={n.color.bg} stopOpacity="0.6" />
              <stop offset="100%" stopColor={n.color.bg} stopOpacity="0" />
            </radialGradient>
          ))}
        </defs>

        {/* Lines from center to nodes */}
        {layout.nodes.map((n) => (
          <line
            key={`l-${n.entry._id}`}
            x1={layout.cx}
            y1={layout.cy}
            x2={n.x}
            y2={n.y}
            stroke={n.color.bg}
            strokeOpacity={hoveredId === n.entry._id || selectedId === n.entry._id ? 0.4 : 0.08}
            strokeWidth={hoveredId === n.entry._id ? 1.5 : 0.5}
            style={{
              transition: "all 0.3s ease",
              opacity: animated ? 1 : 0,
            }}
          />
        ))}

        {/* Category connections */}
        {layout.nodes.map((n, i) => {
          const sameCategory = layout.nodes.filter((m, j) => j !== i && m.cat === n.cat);
          if (sameCategory.length === 0) return null;
          const nearest = sameCategory[0];
          return (
            <line
              key={`c-${n.entry._id}`}
              x1={n.x}
              y1={n.y}
              x2={nearest.x}
              y2={nearest.y}
              stroke={n.color.bg}
              strokeOpacity={0.06}
              strokeWidth={0.5}
              style={{ opacity: animated ? 1 : 0, transition: "opacity 1s ease" }}
            />
          );
        })}

        {/* Center node */}
        <circle cx={layout.cx} cy={layout.cy} r={6} fill="url(#centerGrad)" opacity={animated ? 1 : 0} style={{ transition: "opacity 0.5s ease" }} />
        <defs>
          <radialGradient id="centerGrad">
            <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.8" />
            <stop offset="100%" stopColor="#a855f7" stopOpacity="0.2" />
          </radialGradient>
        </defs>

        {/* Nodes */}
        {layout.nodes.map((n, i) => {
          const isHovered = hoveredId === n.entry._id;
          const isSelected = selectedId === n.entry._id;
          return (
            <g
              key={n.entry._id}
              style={{
                opacity: animated ? 1 : 0,
                transform: animated ? "scale(1)" : "scale(0)",
                transformOrigin: `${n.x}px ${n.y}px`,
                transition: `all 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) ${i * 30}ms`,
                cursor: "pointer",
              }}
              onMouseEnter={() => setHoveredId(n.entry._id)}
              onMouseLeave={() => setHoveredId(null)}
              onClick={() => onSelect?.(n.entry)}
            >
              {/* Glow */}
              <circle cx={n.x} cy={n.y} r={n.r * 3} fill={`url(#glow-${n.entry._id})`} opacity={isHovered || isSelected ? 0.8 : 0.2} style={{ transition: "opacity 0.3s ease" }} />
              {/* Node */}
              <circle cx={n.x} cy={n.y} r={isHovered ? n.r * 1.4 : n.r} fill={n.color.bg} opacity={isHovered || isSelected ? 1 : 0.7} stroke={isSelected ? "#fff" : "transparent"} strokeWidth={1.5} style={{ transition: "all 0.2s ease", filter: isHovered ? `drop-shadow(0 0 6px ${n.color.glow})` : "none" }} />
            </g>
          );
        })}
      </svg>

      {/* Tooltip */}
      {hovered && (
        <div
          className="absolute pointer-events-none bg-white/[0.1] backdrop-blur-xl border border-white/[0.15] rounded-xl px-3 py-2 shadow-[0_8px_32px_rgba(0,0,0,0.4)] max-w-[200px] z-10"
          style={{
            left: Math.min(hovered.x * (containerRef.current?.clientWidth ?? 400) / 400, (containerRef.current?.clientWidth ?? 400) - 220),
            top: Math.min(hovered.y * (containerRef.current?.clientHeight ?? 400) / 400 - 60, (containerRef.current?.clientHeight ?? 400) - 80),
          }}
        >
          <div className="text-xs font-medium text-zinc-200 truncate">{hovered.entry.key.replace(/_/g, " ")}</div>
          <div className="text-[11px] text-zinc-400 mt-0.5 line-clamp-2">{hovered.entry.value}</div>
          <div className="flex items-center gap-1.5 mt-1">
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: hovered.color.bg }} />
            <span className="text-[10px] text-zinc-500 capitalize">{hovered.cat}</span>
          </div>
        </div>
      )}

      {entries.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center">
          <p className="text-zinc-600 text-sm">No knowledge entries yet</p>
        </div>
      )}
    </div>
  );
}
