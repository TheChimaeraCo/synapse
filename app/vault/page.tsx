"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { toast } from "sonner";
import {
  BookOpen,
  FileText,
  Link2,
  RefreshCw,
  Save,
  Search,
  Sparkles,
  Tags,
} from "lucide-react";

import { AppShell } from "@/components/layout/AppShell";
import { gatewayFetch } from "@/lib/gatewayFetch";

interface VaultNote {
  path: string;
  vaultRelativePath: string;
  title: string;
  tags: string[];
  outgoing: string[];
  wordCount: number;
  updatedAt: number;
  size: number;
}

interface VaultIndexResponse {
  vaultPath: string;
  notes: VaultNote[];
  backlinksByPath: Record<string, string[]>;
  stats: {
    notes: number;
    tags: number;
    links: number;
  };
}

type ViewMode = "edit" | "preview" | "split";

export default function VaultPage() {
  const router = useRouter();
  const [index, setIndex] = useState<VaultIndexResponse | null>(null);
  const [loadingIndex, setLoadingIndex] = useState(true);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [content, setContent] = useState("");
  const [originalContent, setOriginalContent] = useState("");
  const [loadingNote, setLoadingNote] = useState(false);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("split");

  const refreshIndex = useCallback(async () => {
    setLoadingIndex(true);
    try {
      const res = await gatewayFetch("/api/vault/index");
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to load vault index");
      setIndex(data as VaultIndexResponse);
      if (!selectedPath && data.notes?.[0]?.path) {
        setSelectedPath(data.notes[0].path);
      }
    } catch (err: any) {
      toast.error(err?.message || "Failed to load vault");
    } finally {
      setLoadingIndex(false);
    }
  }, [selectedPath]);

  const openNote = useCallback(async (path: string) => {
    setSelectedPath(path);
    setLoadingNote(true);
    try {
      const res = await gatewayFetch("/api/files/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "read", path }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to open note");
      setContent(data.content || "");
      setOriginalContent(data.content || "");
    } catch (err: any) {
      toast.error(err?.message || "Failed to open note");
    } finally {
      setLoadingNote(false);
    }
  }, []);

  const saveNote = useCallback(async () => {
    if (!selectedPath) return;
    setSaving(true);
    try {
      const res = await gatewayFetch("/api/files/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "write", path: selectedPath, content }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Failed to save note");
      setOriginalContent(content);
      await refreshIndex();
      toast.success("Note saved");
    } catch (err: any) {
      toast.error(err?.message || "Failed to save note");
    } finally {
      setSaving(false);
    }
  }, [content, refreshIndex, selectedPath]);

  const createNote = useCallback(async () => {
    if (!index) return;
    const raw = window.prompt("New note path (inside vault):", "new-note.md");
    if (!raw) return;
    const clean = raw.replace(/\\/g, "/").replace(/^\/+/, "");
    const withExt = /\.(md|markdown)$/i.test(clean) ? clean : `${clean}.md`;
    const fullPath = `${index.vaultPath}/${withExt}`.replace(/\/+/g, "/");
    const title = withExt.split("/").pop()?.replace(/\.(md|markdown)$/i, "") || "New Note";
    const starter = `# ${title}\n\n`;
    try {
      const res = await gatewayFetch("/api/files/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "write", path: fullPath, content: starter }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Failed to create note");
      await refreshIndex();
      await openNote(fullPath);
      toast.success("Note created");
    } catch (err: any) {
      toast.error(err?.message || "Failed to create note");
    }
  }, [index, openNote, refreshIndex]);

  const analyzeInChat = useCallback(() => {
    if (!selectedPath) return;
    const prompt = `Analyze this vault note and suggest improvements, structure, and next actions:\n\n${selectedPath}\n\nPlease use file_read on this path and then provide a concise analysis plus an optional rewrite draft.`;
    sessionStorage.setItem("synapse_chat_draft", prompt);
    router.push("/chat");
  }, [router, selectedPath]);

  useEffect(() => {
    void refreshIndex();
  }, [refreshIndex]);

  useEffect(() => {
    if (!selectedPath) return;
    void openNote(selectedPath);
  }, [openNote, selectedPath]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void saveNote();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [saveNote]);

  const selectedMeta = useMemo(
    () => index?.notes.find((n) => n.path === selectedPath) || null,
    [index, selectedPath]
  );
  const filteredNotes = useMemo(() => {
    if (!index) return [];
    const q = search.trim().toLowerCase();
    if (!q) return index.notes;
    return index.notes.filter((n) =>
      n.title.toLowerCase().includes(q) ||
      n.vaultRelativePath.toLowerCase().includes(q) ||
      n.tags.some((t) => t.includes(q))
    );
  }, [index, search]);
  const backlinks = useMemo(
    () => (selectedPath && index?.backlinksByPath[selectedPath]) || [],
    [index, selectedPath]
  );
  const isDirty = content !== originalContent;

  return (
    <AppShell title="Vault">
      <div className="h-full grid grid-cols-1 lg:grid-cols-[320px_1fr_320px] bg-transparent text-zinc-100">
        <aside className="border-r border-white/10 bg-white/[0.03] flex flex-col min-h-0">
          <div className="p-3 border-b border-white/10 space-y-2">
            <div className="flex items-center justify-between">
              <div className="text-xs text-zinc-400 uppercase tracking-wide flex items-center gap-1.5">
                <BookOpen className="h-3.5 w-3.5" /> Vault Notes
              </div>
              <button
                onClick={() => void refreshIndex()}
                className="p-1.5 rounded hover:bg-white/10 text-zinc-400 hover:text-zinc-200"
                title="Refresh"
              >
                <RefreshCw className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="flex items-center gap-2 px-2 py-1.5 bg-white/[0.04] rounded border border-white/10">
              <Search className="h-3.5 w-3.5 text-zinc-500" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search notes, tags, paths"
                className="bg-transparent outline-none text-sm w-full placeholder:text-zinc-500"
              />
            </div>
            <div className="flex items-center gap-2 text-xs text-zinc-500">
              <span>{index?.stats.notes ?? 0} notes</span>
              <span>{index?.stats.tags ?? 0} tags</span>
              <span>{index?.stats.links ?? 0} links</span>
            </div>
            <button
              onClick={() => void createNote()}
              className="w-full text-xs px-3 py-2 rounded-lg bg-blue-600/90 hover:bg-blue-500 text-white"
            >
              New Note
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {loadingIndex && <div className="text-xs text-zinc-500 px-2 py-2">Loading vault...</div>}
            {!loadingIndex && filteredNotes.length === 0 && (
              <div className="text-xs text-zinc-500 px-2 py-2">No notes found.</div>
            )}
            {filteredNotes.map((note) => (
              <button
                key={note.path}
                onClick={() => setSelectedPath(note.path)}
                className={`w-full text-left px-2.5 py-2 rounded-lg border transition ${
                  note.path === selectedPath
                    ? "bg-blue-500/10 border-blue-500/30"
                    : "bg-white/[0.02] border-white/10 hover:bg-white/[0.06]"
                }`}
              >
                <div className="text-sm font-medium truncate">{note.title}</div>
                <div className="text-[11px] text-zinc-500 truncate">{note.vaultRelativePath}</div>
              </button>
            ))}
          </div>
        </aside>

        <section className="flex flex-col min-h-0">
          <div className="px-4 py-3 border-b border-white/10 bg-white/[0.03] flex flex-wrap items-center gap-2">
            <FileText className="h-4 w-4 text-zinc-400" />
            <div className="text-sm truncate flex-1 min-w-0">
              {selectedMeta?.vaultRelativePath || "Select a note"}
              {isDirty && <span className="ml-2 text-amber-400">*</span>}
            </div>
            <div className="flex items-center gap-1 rounded-lg border border-white/10 bg-white/[0.03] p-1">
              {(["edit", "preview", "split"] as ViewMode[]).map((mode) => (
                <button
                  key={mode}
                  onClick={() => setViewMode(mode)}
                  className={`px-2 py-1 text-xs rounded ${
                    viewMode === mode ? "bg-white/15 text-white" : "text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  {mode}
                </button>
              ))}
            </div>
            <button
              onClick={() => void saveNote()}
              disabled={!selectedPath || saving || !isDirty}
              className="inline-flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg bg-emerald-600/90 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Save className="h-3.5 w-3.5" />
              {saving ? "Saving..." : "Save"}
            </button>
            <button
              onClick={analyzeInChat}
              disabled={!selectedPath}
              className="inline-flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg bg-purple-600/90 hover:bg-purple-500 disabled:opacity-50"
              title="Open chat with a prepared analysis prompt"
            >
              <Sparkles className="h-3.5 w-3.5" />
              Analyze with Agent
            </button>
          </div>

          {!selectedPath ? (
            <div className="flex-1 grid place-items-center text-zinc-500 text-sm">Select a note to start editing.</div>
          ) : loadingNote ? (
            <div className="flex-1 grid place-items-center text-zinc-500 text-sm">Loading note...</div>
          ) : (
            <div className={`flex-1 min-h-0 ${viewMode === "split" ? "grid grid-cols-2" : "grid grid-cols-1"}`}>
              {(viewMode === "edit" || viewMode === "split") && (
                <textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  spellCheck={false}
                  className="h-full w-full resize-none bg-[#0d1117] text-zinc-100 text-sm leading-6 p-4 outline-none border-r border-white/10 font-mono"
                />
              )}
              {(viewMode === "preview" || viewMode === "split") && (
                <div className="h-full overflow-auto p-6 prose prose-invert prose-zinc max-w-none">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
                </div>
              )}
            </div>
          )}
        </section>

        <aside className="border-l border-white/10 bg-white/[0.03] flex flex-col min-h-0">
          <div className="p-3 border-b border-white/10 text-xs uppercase tracking-wide text-zinc-400">
            Note Context
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-4">
            <div>
              <div className="text-xs text-zinc-500 mb-1">Agent Access</div>
              <div className="text-xs text-zinc-300 bg-white/[0.03] border border-white/10 rounded-lg p-2">
                Agent tools can read/write these notes via workspace paths like:
                <div className="mt-1 font-mono text-zinc-400">{selectedPath || `${index?.vaultPath || "obsidian-vault"}/...`}</div>
              </div>
            </div>

            <div>
              <div className="flex items-center gap-1.5 text-xs text-zinc-400 mb-2">
                <Tags className="h-3.5 w-3.5" /> Tags
              </div>
              <div className="flex flex-wrap gap-1.5">
                {selectedMeta?.tags?.length ? (
                  selectedMeta.tags.map((tag) => (
                    <button
                      key={tag}
                      onClick={() => setSearch(tag)}
                      className="px-2 py-0.5 text-[11px] rounded-full bg-blue-500/15 border border-blue-500/30 text-blue-300"
                    >
                      #{tag}
                    </button>
                  ))
                ) : (
                  <div className="text-xs text-zinc-500">No tags</div>
                )}
              </div>
            </div>

            <div>
              <div className="flex items-center gap-1.5 text-xs text-zinc-400 mb-2">
                <Link2 className="h-3.5 w-3.5" /> Outgoing Links
              </div>
              <div className="space-y-1.5">
                {selectedMeta?.outgoing?.length ? (
                  selectedMeta.outgoing.map((p) => (
                    <button
                      key={p}
                      onClick={() => setSelectedPath(p)}
                      className="block w-full text-left text-xs px-2 py-1.5 rounded bg-white/[0.03] border border-white/10 hover:bg-white/[0.08] truncate"
                    >
                      {p}
                    </button>
                  ))
                ) : (
                  <div className="text-xs text-zinc-500">No outgoing links</div>
                )}
              </div>
            </div>

            <div>
              <div className="flex items-center gap-1.5 text-xs text-zinc-400 mb-2">
                <Link2 className="h-3.5 w-3.5" /> Backlinks
              </div>
              <div className="space-y-1.5">
                {backlinks.length ? (
                  backlinks.map((p) => (
                    <button
                      key={p}
                      onClick={() => setSelectedPath(p)}
                      className="block w-full text-left text-xs px-2 py-1.5 rounded bg-white/[0.03] border border-white/10 hover:bg-white/[0.08] truncate"
                    >
                      {p}
                    </button>
                  ))
                ) : (
                  <div className="text-xs text-zinc-500">No backlinks</div>
                )}
              </div>
            </div>
          </div>
        </aside>
      </div>
    </AppShell>
  );
}

