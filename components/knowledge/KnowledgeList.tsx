"use client";

import { useState, useMemo } from "react";
import { Pencil, Trash2, ArrowUpDown } from "lucide-react";

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

const CATEGORY_COLORS: Record<string, string> = {
  preference: "bg-blue-500/15 text-blue-400 border-blue-500/20",
  fact: "bg-purple-500/15 text-purple-400 border-purple-500/20",
  decision: "bg-amber-500/15 text-amber-400 border-amber-500/20",
  action_item: "bg-green-500/15 text-green-400 border-green-500/20",
  project: "bg-cyan-500/15 text-cyan-400 border-cyan-500/20",
  person: "bg-pink-500/15 text-pink-400 border-pink-500/20",
};

const SOURCE_COLORS: Record<string, string> = {
  conversation: "text-blue-400",
  manual: "text-zinc-400",
  extraction: "text-purple-400",
};

type SortMode = "newest" | "oldest" | "confidence" | "category";

interface Props {
  entries: KnowledgeEntry[];
  searchQuery: string;
  categoryFilter: string | null;
  onEdit: (entry: KnowledgeEntry) => void;
  onDelete: (id: string) => void;
  selectedId?: string | null;
}

export function KnowledgeList({ entries, searchQuery, categoryFilter, onEdit, onDelete, selectedId }: Props) {
  const [sort, setSort] = useState<SortMode>("newest");

  const filtered = useMemo(() => {
    let result = entries;
    if (categoryFilter) result = result.filter((e) => (e.category || "other") === categoryFilter);
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter((e) => e.key.toLowerCase().includes(q) || e.value.toLowerCase().includes(q));
    }
    switch (sort) {
      case "newest": return [...result].sort((a, b) => b.updatedAt - a.updatedAt);
      case "oldest": return [...result].sort((a, b) => a.updatedAt - b.updatedAt);
      case "confidence": return [...result].sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0));
      case "category": return [...result].sort((a, b) => (a.category || "").localeCompare(b.category || ""));
      default: return result;
    }
  }, [entries, categoryFilter, searchQuery, sort]);

  const sortOptions: { value: SortMode; label: string }[] = [
    { value: "newest", label: "Newest" },
    { value: "oldest", label: "Oldest" },
    { value: "confidence", label: "Confidence" },
    { value: "category", label: "Category" },
  ];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs text-zinc-500">{filtered.length} entries</span>
        <div className="flex items-center gap-1.5">
          <ArrowUpDown className="h-3 w-3 text-zinc-500" />
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortMode)}
            className="bg-transparent text-xs text-zinc-400 border-none focus:outline-none cursor-pointer"
          >
            {sortOptions.map((o) => (
              <option key={o.value} value={o.value} className="bg-zinc-900">{o.label}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid gap-2">
        {filtered.map((entry) => {
          const catClass = CATEGORY_COLORS[entry.category || ""] || "bg-zinc-500/15 text-zinc-400 border-zinc-500/20";
          const srcClass = SOURCE_COLORS[entry.source || ""] || "text-zinc-500";
          const isSelected = selectedId === entry._id;

          return (
            <div
              key={entry._id}
              className={`group bg-white/[0.04] backdrop-blur-2xl border rounded-2xl p-4 transition-all duration-200 hover:bg-white/[0.06] ${
                isSelected ? "border-blue-500/30 shadow-[0_0_20px_rgba(59,130,246,0.1)]" : "border-white/[0.08]"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-medium text-zinc-200">{entry.key.replace(/_/g, " ")}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full border capitalize ${catClass}`}>
                      {(entry.category || "other").replace(/_/g, " ")}
                    </span>
                  </div>
                  <p className="text-sm text-zinc-400 leading-relaxed">{entry.value}</p>
                  <div className="flex items-center gap-3 mt-2">
                    <span className={`text-[10px] capitalize ${srcClass}`}>{entry.source || "unknown"}</span>
                    <span className="text-[10px] text-zinc-600">{new Date(entry.updatedAt).toLocaleDateString()}</span>
                  </div>
                </div>

                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                  <button
                    onClick={() => onEdit(entry)}
                    className="p-1.5 rounded-lg hover:bg-white/[0.08] text-zinc-500 hover:text-zinc-300 transition-all"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => onDelete(entry._id)}
                    className="p-1.5 rounded-lg hover:bg-red-500/10 text-zinc-500 hover:text-red-400 transition-all"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              {/* Confidence bar */}
              <div className="mt-2.5 flex items-center gap-2">
                <div className="flex-1 h-1 rounded-full bg-white/[0.06] overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-red-500 via-yellow-500 to-green-500"
                    style={{ width: `${(entry.confidence ?? 0.5) * 100}%`, transition: "width 0.5s ease" }}
                  />
                </div>
                <span className="text-[10px] text-zinc-500 font-mono w-8 text-right">{((entry.confidence ?? 0.5) * 100).toFixed(0)}%</span>
              </div>
            </div>
          );
        })}

        {filtered.length === 0 && (
          <div className="text-center py-12 text-zinc-600 text-sm">
            {searchQuery || categoryFilter ? "No entries match your filters" : "No knowledge entries yet"}
          </div>
        )}
      </div>
    </div>
  );
}
