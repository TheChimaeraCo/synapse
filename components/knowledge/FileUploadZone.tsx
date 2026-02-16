"use client";

import { useState, useCallback, useRef } from "react";
import { Upload, FileText, X, Check, AlertCircle, Loader2 } from "lucide-react";

interface ParsedEntry {
  key: string;
  value: string;
  category: string;
  selected: boolean;
}

interface Props {
  onImport: (entries: { key: string; value: string; category: string; source: string; confidence: number }[]) => Promise<void>;
}

function parseFileContent(filename: string, content: string): ParsedEntry[] {
  const ext = filename.split(".").pop()?.toLowerCase();
  const entries: ParsedEntry[] = [];

  if (ext === "md" || ext === "markdown") {
    // Parse markdown: each heading becomes an entry
    const sections = content.split(/^#{1,3}\s+/m).filter(Boolean);
    const headings = content.match(/^#{1,3}\s+(.+)$/gm) || [];
    
    if (headings.length > 0) {
      headings.forEach((h, i) => {
        const key = h.replace(/^#{1,3}\s+/, "").trim();
        const value = (sections[i + 1] || "").trim();
        if (key && value) {
          entries.push({ key: key.substring(0, 100), value: value.substring(0, 2000), category: "fact", selected: true });
        }
      });
    }
    
    if (entries.length === 0 && content.trim()) {
      entries.push({
        key: filename.replace(/\.[^/.]+$/, "").replace(/[-_]/g, " "),
        value: content.substring(0, 2000).trim(),
        category: "fact",
        selected: true,
      });
    }
  } else if (ext === "json") {
    try {
      const data = JSON.parse(content);
      const items = Array.isArray(data) ? data : [data];
      for (const item of items) {
        if (item.key && item.value) {
          entries.push({
            key: String(item.key).substring(0, 100),
            value: String(item.value).substring(0, 2000),
            category: item.category || "fact",
            selected: true,
          });
        }
      }
    } catch {
      entries.push({
        key: filename.replace(/\.[^/.]+$/, ""),
        value: content.substring(0, 2000).trim(),
        category: "fact",
        selected: true,
      });
    }
  } else {
    // Plain text: split by double newlines or treat as single entry
    const paragraphs = content.split(/\n\n+/).filter((p) => p.trim().length > 10);
    if (paragraphs.length > 1 && paragraphs.length <= 50) {
      paragraphs.forEach((p, i) => {
        const firstLine = p.trim().split("\n")[0].substring(0, 100);
        entries.push({
          key: firstLine,
          value: p.trim().substring(0, 2000),
          category: "fact",
          selected: true,
        });
      });
    } else {
      entries.push({
        key: filename.replace(/\.[^/.]+$/, "").replace(/[-_]/g, " "),
        value: content.substring(0, 2000).trim(),
        category: "fact",
        selected: true,
      });
    }
  }

  return entries;
}

const CATEGORIES = ["preference", "fact", "decision", "action_item", "project", "person", "other"];

export function FileUploadZone({ onImport }: Props) {
  const [dragOver, setDragOver] = useState(false);
  const [parsedEntries, setParsedEntries] = useState<ParsedEntry[]>([]);
  const [fileName, setFileName] = useState("");
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback((file: File) => {
    setError("");
    if (file.size > 500_000) {
      setError("File too large (max 500KB)");
      return;
    }

    const validTypes = [
      "text/plain", "text/markdown", "application/json",
      "text/csv", "text/x-markdown",
    ];
    const ext = file.name.split(".").pop()?.toLowerCase();
    const validExts = ["txt", "md", "markdown", "json", "csv"];

    if (!validTypes.includes(file.type) && !validExts.includes(ext || "")) {
      setError("Unsupported file type. Use .txt, .md, or .json");
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      if (!content?.trim()) {
        setError("File is empty");
        return;
      }
      const entries = parseFileContent(file.name, content);
      setParsedEntries(entries);
      setFileName(file.name);
    };
    reader.onerror = () => setError("Failed to read file");
    reader.readAsText(file);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const handleImport = async () => {
    const selected = parsedEntries.filter((e) => e.selected);
    if (selected.length === 0) return;
    setImporting(true);
    try {
      await onImport(
        selected.map((e) => ({
          key: e.key,
          value: e.value,
          category: e.category,
          source: "manual",
          confidence: 0.8,
        }))
      );
      setParsedEntries([]);
      setFileName("");
    } catch {
      setError("Failed to import entries");
    } finally {
      setImporting(false);
    }
  };

  const toggleEntry = (i: number) => {
    setParsedEntries((prev) => prev.map((e, idx) => (idx === i ? { ...e, selected: !e.selected } : e)));
  };

  const updateCategory = (i: number, category: string) => {
    setParsedEntries((prev) => prev.map((e, idx) => (idx === i ? { ...e, category } : e)));
  };

  const selectedCount = parsedEntries.filter((e) => e.selected).length;

  // Preview mode
  if (parsedEntries.length > 0) {
    return (
      <div className="bg-white/[0.04] border border-white/10 rounded-2xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.08]">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-blue-400" />
            <span className="text-sm font-medium text-zinc-200">{fileName}</span>
            <span className="text-xs text-zinc-500">{parsedEntries.length} entries parsed</span>
          </div>
          <button
            onClick={() => { setParsedEntries([]); setFileName(""); }}
            className="text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="max-h-72 overflow-auto divide-y divide-white/[0.04]">
          {parsedEntries.map((entry, i) => (
            <div key={i} className={`flex items-start gap-3 px-4 py-3 transition-all ${entry.selected ? "bg-white/[0.02]" : "opacity-40"}`}>
              <input
                type="checkbox"
                checked={entry.selected}
                onChange={() => toggleEntry(i)}
                className="mt-1 shrink-0 accent-blue-500"
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm font-medium text-zinc-300 truncate">{entry.key}</span>
                  <select
                    value={entry.category}
                    onChange={(e) => updateCategory(i, e.target.value)}
                    className="text-[10px] bg-white/[0.06] border border-white/[0.08] rounded-lg px-1.5 py-0.5 text-zinc-400 focus:outline-none"
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c} value={c} className="bg-zinc-900">{c.replace(/_/g, " ")}</option>
                    ))}
                  </select>
                </div>
                <p className="text-xs text-zinc-500 line-clamp-3">{entry.value}</p>
              </div>
            </div>
          ))}
        </div>

        {error && (
          <div className="px-4 py-2 flex items-center gap-2 text-xs text-red-400">
            <AlertCircle className="w-3 h-3" /> {error}
          </div>
        )}

        <div className="flex items-center justify-between px-4 py-3 border-t border-white/[0.08]">
          <button
            onClick={() => {
              const allSelected = parsedEntries.every((e) => e.selected);
              setParsedEntries((prev) => prev.map((e) => ({ ...e, selected: !allSelected })));
            }}
            className="text-xs text-zinc-400 hover:text-zinc-200 transition-colors"
          >
            {parsedEntries.every((e) => e.selected) ? "Deselect All" : "Select All"}
          </button>
          <button
            onClick={handleImport}
            disabled={selectedCount === 0 || importing}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium bg-gradient-to-r from-blue-500 to-blue-600 text-white hover:brightness-110 disabled:opacity-40 transition-all"
          >
            {importing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
            Import {selectedCount} {selectedCount === 1 ? "Entry" : "Entries"}
          </button>
        </div>
      </div>
    );
  }

  // Drop zone
  return (
    <div>
      <input
        ref={fileRef}
        type="file"
        accept=".txt,.md,.markdown,.json,.csv"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
          e.target.value = "";
        }}
      />
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => fileRef.current?.click()}
        className={`border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition-all duration-200 ${
          dragOver
            ? "border-blue-500/50 bg-blue-500/[0.06]"
            : "border-white/[0.08] hover:border-white/[0.15] hover:bg-white/[0.02]"
        }`}
      >
        <Upload className={`w-6 h-6 mx-auto mb-2 transition-colors ${dragOver ? "text-blue-400" : "text-zinc-600"}`} />
        <p className="text-sm text-zinc-400">
          Drop files here or <span className="text-blue-400">browse</span>
        </p>
        <p className="text-xs text-zinc-600 mt-1">.txt, .md, .json - max 500KB</p>
      </div>
      {error && (
        <div className="mt-2 flex items-center gap-2 text-xs text-red-400">
          <AlertCircle className="w-3 h-3" /> {error}
        </div>
      )}
    </div>
  );
}
