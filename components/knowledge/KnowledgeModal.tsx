"use client";

import { useState, useEffect } from "react";
import { X } from "lucide-react";
import { Slider } from "@/components/ui/slider";

interface KnowledgeEntry {
  _id?: string;
  key: string;
  value: string;
  category?: string;
  source?: string;
  confidence?: number;
}

const CATEGORIES = ["preference", "fact", "decision", "action_item", "project", "person", "other"];
const SOURCES = ["conversation", "manual", "extraction"];

interface Props {
  entry?: KnowledgeEntry | null;
  onSave: (data: { key: string; value: string; category: string; source: string; confidence: number; id?: string }) => void;
  onClose: () => void;
}

export function KnowledgeModal({ entry, onSave, onClose }: Props) {
  const [key, setKey] = useState(entry?.key || "");
  const [value, setValue] = useState(entry?.value || "");
  const [category, setCategory] = useState(entry?.category || "fact");
  const [source, setSource] = useState(entry?.source || "manual");
  const [confidence, setConfidence] = useState(entry?.confidence ?? 0.8);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const handleSubmit = () => {
    if (!key.trim() || !value.trim()) return;
    onSave({ key: key.trim(), value: value.trim(), category, source, confidence, id: entry?._id });
  };

  const inputClass = "w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-3 py-2.5 text-sm text-zinc-200 placeholder-zinc-600 focus:border-blue-500/30 focus:ring-1 focus:ring-blue-500/20 focus:outline-none transition-all";

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white/[0.07] backdrop-blur-3xl border border-white/[0.12] rounded-2xl w-full max-w-md shadow-[0_16px_64px_rgba(0,0,0,0.5)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.08]">
          <h3 className="text-sm font-semibold text-zinc-200">{entry?._id ? "Edit Entry" : "Add Knowledge"}</h3>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300 transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <label className="text-[11px] text-zinc-500 uppercase tracking-wider mb-1.5 block">Key</label>
            <input className={inputClass} value={key} onChange={(e) => setKey(e.target.value)} placeholder="e.g. favorite_food" />
          </div>
          <div>
            <label className="text-[11px] text-zinc-500 uppercase tracking-wider mb-1.5 block">Value</label>
            <textarea className={`${inputClass} resize-none h-20`} value={value} onChange={(e) => setValue(e.target.value)} placeholder="e.g. pizza" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] text-zinc-500 uppercase tracking-wider mb-1.5 block">Category</label>
              <select className={inputClass} value={category} onChange={(e) => setCategory(e.target.value)}>
                {CATEGORIES.map((c) => (
                  <option key={c} value={c} className="bg-zinc-900">{c.replace(/_/g, " ")}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[11px] text-zinc-500 uppercase tracking-wider mb-1.5 block">Source</label>
              <select className={inputClass} value={source} onChange={(e) => setSource(e.target.value)}>
                {SOURCES.map((s) => (
                  <option key={s} value={s} className="bg-zinc-900">{s}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="text-[11px] text-zinc-500 uppercase tracking-wider mb-1.5 block">
              Confidence: {(confidence * 100).toFixed(0)}%
            </label>
            <Slider
              min={0}
              max={1}
              step={0.05}
              value={confidence}
              onChange={(v) => setConfidence(v)}
            />
            <div className="w-full h-1.5 rounded-full bg-white/[0.06] overflow-hidden mt-1">
              <div
                className="h-full rounded-full bg-gradient-to-r from-red-500 via-yellow-500 to-green-500"
                style={{ width: `${confidence * 100}%`, transition: "width 0.2s ease" }}
              />
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-white/[0.08]">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-sm text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.06] transition-all"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!key.trim() || !value.trim()}
            className="px-4 py-2 rounded-xl text-sm font-medium bg-gradient-to-r from-blue-500 to-purple-500 text-white hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-[0_0_20px_rgba(59,130,246,0.2)]"
          >
            {entry?._id ? "Update" : "Add Entry"}
          </button>
        </div>
      </div>
    </div>
  );
}
