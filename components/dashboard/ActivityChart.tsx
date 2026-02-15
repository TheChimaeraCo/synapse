"use client";

import { useState, useMemo } from "react";

interface DataPoint {
  date: string;
  count: number;
}

export function ActivityChart({ data }: { data: DataPoint[] }) {
  const [range, setRange] = useState<"7d" | "30d">("7d");
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const filtered = useMemo(() => {
    if (range === "7d") return data.slice(-7);
    return data.slice(-30);
  }, [data, range]);

  const max = Math.max(...filtered.map((d) => d.count), 1);
  const padding = { top: 20, right: 20, bottom: 30, left: 40 };
  const width = 600;
  const height = 200;
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;

  const points = filtered.map((d, i) => ({
    x: padding.left + (filtered.length > 1 ? (i / (filtered.length - 1)) * chartW : chartW / 2),
    y: padding.top + chartH - (d.count / max) * chartH,
    ...d,
  }));

  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
  const areaPath = `${linePath} L ${points[points.length - 1]?.x ?? 0} ${padding.top + chartH} L ${points[0]?.x ?? 0} ${padding.top + chartH} Z`;

  const yTicks = [0, Math.round(max * 0.5), max];

  return (
    <div className="bg-white/[0.04] backdrop-blur-2xl border border-white/[0.08] rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.3)] p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-medium text-zinc-200">Activity</h3>
          <p className="text-xs text-zinc-500">Messages over time</p>
        </div>
        <div className="flex gap-1 bg-white/[0.06] rounded-lg p-0.5">
          {(["7d", "30d"] as const).map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`px-3 py-1 text-xs rounded-md transition-all ${
                range === r
                  ? "bg-white/[0.12] text-zinc-200"
                  : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-auto"
        onMouseLeave={() => setHoverIdx(null)}
      >
        <defs>
          <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgb(59,130,246)" stopOpacity="0.3" />
            <stop offset="100%" stopColor="rgb(59,130,246)" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Y-axis grid lines */}
        {yTicks.map((tick) => {
          const y = padding.top + chartH - (tick / max) * chartH;
          return (
            <g key={tick}>
              <line
                x1={padding.left}
                y1={y}
                x2={width - padding.right}
                y2={y}
                stroke="rgba(255,255,255,0.05)"
              />
              <text x={padding.left - 8} y={y + 4} textAnchor="end" className="fill-zinc-600 text-[10px]">
                {tick}
              </text>
            </g>
          );
        })}

        {/* Area fill */}
        {points.length > 1 && <path d={areaPath} fill="url(#areaGrad)" />}

        {/* Line */}
        {points.length > 1 && (
          <path d={linePath} fill="none" stroke="rgb(59,130,246)" strokeWidth="2" strokeLinejoin="round" />
        )}

        {/* Data points + hover areas */}
        {points.map((p, i) => {
          const dayLabel = new Date(p.date + "T00:00:00Z").toLocaleDateString("en", {
            month: "short",
            day: "numeric",
          });
          return (
            <g key={i}>
              <rect
                x={p.x - chartW / filtered.length / 2}
                y={padding.top}
                width={chartW / filtered.length}
                height={chartH}
                fill="transparent"
                onMouseEnter={() => setHoverIdx(i)}
              />
              <circle cx={p.x} cy={p.y} r={hoverIdx === i ? 5 : 3} fill="rgb(59,130,246)" opacity={hoverIdx === i ? 1 : 0.6} className="transition-all" />
              {/* X label */}
              {(filtered.length <= 10 || i % Math.ceil(filtered.length / 7) === 0) && (
                <text x={p.x} y={height - 5} textAnchor="middle" className="fill-zinc-600 text-[10px]">
                  {dayLabel}
                </text>
              )}
              {/* Hover tooltip */}
              {hoverIdx === i && (
                <g>
                  <line x1={p.x} y1={padding.top} x2={p.x} y2={padding.top + chartH} stroke="rgba(255,255,255,0.1)" strokeDasharray="4 4" />
                  <rect x={p.x - 30} y={p.y - 28} width="60" height="22" rx="6" fill="rgba(0,0,0,0.8)" stroke="rgba(255,255,255,0.1)" />
                  <text x={p.x} y={p.y - 13} textAnchor="middle" className="fill-zinc-200 text-[11px] font-medium">
                    {p.count} msgs
                  </text>
                </g>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
