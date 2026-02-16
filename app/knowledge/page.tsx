"use client";

import { useState, useEffect, useCallback } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { KnowledgeGraph } from "@/components/knowledge/KnowledgeGraph";
import { CategoryBreakdown } from "@/components/knowledge/CategoryBreakdown";
import { KnowledgeStats } from "@/components/knowledge/KnowledgeStats";
import { KnowledgeList } from "@/components/knowledge/KnowledgeList";
import { KnowledgeModal } from "@/components/knowledge/KnowledgeModal";
import { gatewayFetch } from "@/lib/gatewayFetch";
import { useFetch } from "@/lib/hooks";
import { toast } from "sonner";
import { Plus, Search, X, Trash2, Brain } from "lucide-react";

interface KnowledgeEntry {
  _id: string;
  gatewayId: string;
  agentId: string;
  key: string;
  value: string;
  category?: string;
  source?: string;
  confidence?: number;
  createdAt: number;
  updatedAt: number;
}

export default function KnowledgePage() {
  const { data: agents } = useFetch<any[]>("/api/agents");
  const agent = agents?.[0];
  const [entries, setEntries] = useState<KnowledgeEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [modalEntry, setModalEntry] = useState<KnowledgeEntry | null | undefined>(undefined);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [memorySearch, setMemorySearch] = useState("");
  const [memoryResults, setMemoryResults] = useState<KnowledgeEntry[]>([]);
  const [memorySearching, setMemorySearching] = useState(false);
  const [bulkSelected, setBulkSelected] = useState<Set<string>>(new Set());
  const [bulkMode, setBulkMode] = useState(false);

  const fetchEntries = useCallback(async () => {
    if (!agent?._id) return;
    setLoading(true);
    try {
      const res = await gatewayFetch(`/api/knowledge?agentId=${agent._id}`);
      const data = await res.json();
      setEntries(data.knowledge || []);
    } catch {
      toast.error("Failed to load knowledge");
    } finally {
      setLoading(false);
    }
  }, [agent?._id]);

  useEffect(() => {
    fetchEntries();
  }, [fetchEntries]);

  const handleSave = async (data: { key: string; value: string; category: string; source: string; confidence: number; id?: string }) => {
    try {
      if (data.id) {
        await gatewayFetch("/api/knowledge", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: data.id, value: data.value, category: data.category, confidence: data.confidence }),
        });
        toast.success("Entry updated");
      } else {
        await gatewayFetch("/api/knowledge", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ agentId: agent?._id, key: data.key, value: data.value, category: data.category, source: data.source, confidence: data.confidence }),
        });
        toast.success("Entry added");
      }
      setModalEntry(undefined);
      fetchEntries();
    } catch {
      toast.error("Failed to save");
    }
  };

  const handleMemorySearch = async () => {
    if (!memorySearch.trim() || !agent?._id) return;
    setMemorySearching(true);
    try {
      const res = await gatewayFetch(`/api/knowledge/search?agentId=${agent._id}&q=${encodeURIComponent(memorySearch)}`);
      const data = await res.json();
      setMemoryResults(data.results || []);
    } catch {
      // Fallback: client-side keyword search
      const q = memorySearch.toLowerCase();
      const scored = entries
        .map(e => {
          const text = `${e.key} ${e.value} ${e.category || ""}`.toLowerCase();
          const words = q.split(/\s+/);
          let score = 0;
          for (const w of words) {
            if (text.includes(w)) score++;
          }
          return { ...e, score };
        })
        .filter(e => e.score > 0)
        .sort((a, b) => b.score - a.score);
      setMemoryResults(scored);
    } finally {
      setMemorySearching(false);
    }
  };

  const handleBulkDelete = async () => {
    if (bulkSelected.size === 0) return;
    const confirmed = window.confirm(`Delete ${bulkSelected.size} entries? This cannot be undone.`);
    if (!confirmed) return;
    let deleted = 0;
    for (const id of bulkSelected) {
      try {
        await gatewayFetch("/api/knowledge", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id }),
        });
        deleted++;
      } catch {}
    }
    setBulkSelected(new Set());
    setBulkMode(false);
    toast.success(`Deleted ${deleted} entries`);
    fetchEntries();
  };

  const handleDelete = async (id: string) => {
    try {
      await gatewayFetch("/api/knowledge", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      setEntries((prev) => prev.filter((e) => e._id !== id));
      toast.success("Entry removed");
    } catch {
      toast.error("Failed to delete");
    }
  };

  return (
    <AppShell title="Knowledge Base">
      <div className="p-4 lg:p-6 space-y-5 overflow-auto h-full">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h1 className="text-xl font-semibold text-zinc-100">Knowledge Base</h1>
            <p className="text-xs text-zinc-500 mt-0.5">Facts and preferences learned from conversations</p>
          </div>
          <div className="flex items-center gap-2">
            {showSearch ? (
              <div className="flex items-center gap-1.5 bg-white/[0.04] border border-white/[0.08] rounded-xl px-3 py-1.5">
                <Search className="h-3.5 w-3.5 text-zinc-500" />
                <input
                  autoFocus
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search..."
                  className="bg-transparent text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none w-40"
                />
                <button onClick={() => { setShowSearch(false); setSearchQuery(""); }} className="text-zinc-500 hover:text-zinc-300">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowSearch(true)}
                className="p-2 rounded-xl text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.06] transition-all"
              >
                <Search className="h-4 w-4" />
              </button>
            )}
            <button
              onClick={() => setModalEntry(null)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium bg-gradient-to-r from-blue-500 to-purple-500 text-white hover:brightness-110 transition-all shadow-[0_0_20px_rgba(59,130,246,0.15)]"
            >
              <Plus className="h-3.5 w-3.5" />
              Add
            </button>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-6 h-6 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
          </div>
        ) : entries.length === 0 ? (
          <div className="flex flex-col items-center justify-center min-h-[300px] text-zinc-400">
            <div className="w-16 h-16 rounded-2xl bg-white/[0.04] border border-white/[0.08] flex items-center justify-center mb-4">
              <Search className="h-7 w-7 text-zinc-600" />
            </div>
            <p className="text-lg font-medium text-zinc-300 mb-1">No knowledge yet</p>
            <p className="text-sm text-zinc-500 mb-4">Add facts and preferences manually or let your AI learn from conversations.</p>
            <button
              onClick={() => setModalEntry(null)}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium bg-gradient-to-r from-blue-500 to-purple-500 text-white hover:brightness-110 transition-all"
            >
              <Plus className="h-3.5 w-3.5" />
              Add First Entry
            </button>
          </div>
        ) : (
          <>
            {/* Visualizations */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="lg:col-span-2">
                <KnowledgeGraph
                  entries={entries}
                  onSelect={(e) => setSelectedId(selectedId === e._id ? null : e._id)}
                  selectedId={selectedId}
                />
              </div>
              <CategoryBreakdown
                entries={entries}
                selectedCategory={categoryFilter}
                onSelectCategory={setCategoryFilter}
              />
            </div>

            {/* Stats */}
            <KnowledgeStats entries={entries} />

            {/* Memory Browser */}
            <div className="bg-white/[0.04] border border-white/10 rounded-2xl p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Brain className="w-4 h-4 text-blue-400" />
                  <h3 className="text-sm font-medium text-zinc-200">Memory Browser</h3>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => { setBulkMode(!bulkMode); setBulkSelected(new Set()); }}
                    className={`text-xs px-2.5 py-1 rounded-lg transition-all ${bulkMode ? "bg-red-500/20 text-red-300 border border-red-500/30" : "text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.06]"}`}
                  >
                    {bulkMode ? "Cancel" : "Bulk Delete"}
                  </button>
                  {bulkMode && bulkSelected.size > 0 && (
                    <button
                      onClick={handleBulkDelete}
                      className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg bg-red-500/20 text-red-300 border border-red-500/30 hover:bg-red-500/30"
                    >
                      <Trash2 className="w-3 h-3" />
                      Delete {bulkSelected.size}
                    </button>
                  )}
                </div>
              </div>
              <div className="flex gap-2 mb-3">
                <input
                  value={memorySearch}
                  onChange={(e) => setMemorySearch(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleMemorySearch()}
                  placeholder="Search memories by keyword or concept..."
                  className="flex-1 bg-white/[0.04] border border-white/[0.08] rounded-xl px-3 py-2 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-blue-500/30"
                />
                <button
                  onClick={handleMemorySearch}
                  disabled={memorySearching}
                  className="px-3 py-2 rounded-xl bg-gradient-to-r from-blue-500 to-blue-600 text-white text-sm font-medium hover:brightness-110 transition-all disabled:opacity-50"
                >
                  {memorySearching ? "..." : "Search"}
                </button>
              </div>
              {memoryResults.length > 0 && (
                <div className="space-y-1.5 max-h-64 overflow-auto">
                  {memoryResults.map((r) => (
                    <div key={r._id} className="flex items-start gap-2 p-2 rounded-lg bg-white/[0.02] hover:bg-white/[0.04] transition-all">
                      {bulkMode && (
                        <input
                          type="checkbox"
                          checked={bulkSelected.has(r._id)}
                          onChange={() => {
                            const next = new Set(bulkSelected);
                            if (next.has(r._id)) next.delete(r._id); else next.add(r._id);
                            setBulkSelected(next);
                          }}
                          className="mt-1 shrink-0"
                        />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs px-1.5 py-0.5 rounded bg-white/[0.06] text-zinc-400">{r.category || "general"}</span>
                          <span className="text-xs font-medium text-zinc-300 truncate">{r.key}</span>
                        </div>
                        <p className="text-xs text-zinc-500 mt-0.5 line-clamp-2">{r.value}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {memorySearch && memoryResults.length === 0 && !memorySearching && (
                <p className="text-xs text-zinc-600 text-center py-4">No results found</p>
              )}
            </div>

            {/* List */}
            <KnowledgeList
              entries={entries}
              searchQuery={searchQuery}
              categoryFilter={categoryFilter}
              onEdit={(e) => setModalEntry(e)}
              onDelete={handleDelete}
              selectedId={selectedId}
            />
          </>
        )}

        {/* Modal */}
        {modalEntry !== undefined && (
          <KnowledgeModal
            entry={modalEntry}
            onSave={handleSave}
            onClose={() => setModalEntry(undefined)}
          />
        )}
      </div>
    </AppShell>
  );
}
