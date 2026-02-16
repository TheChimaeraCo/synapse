"use client";

import { useState, useEffect } from "react";
import { Tag, Calendar, ChevronDown, ChevronRight } from "lucide-react";

interface ChangelogEntry {
  version: string;
  title: string;
  date: string;
  sections: { heading: string; items: string[] }[];
}

function parseChangelog(md: string): ChangelogEntry[] {
  const entries: ChangelogEntry[] = [];
  const lines = md.split("\n");
  let current: ChangelogEntry | null = null;
  let currentSection: { heading: string; items: string[] } | null = null;

  for (const line of lines) {
    // Match ## v0.9.0 - Wave 9 (2026-02-16)
    const versionMatch = line.match(/^## (v[\d.]+)\s*-\s*(.+?)\s*\((\d{4}-\d{2}-\d{2})\)/);
    if (versionMatch) {
      if (current) entries.push(current);
      current = { version: versionMatch[1], title: versionMatch[2], date: versionMatch[3], sections: [] };
      currentSection = null;
      continue;
    }
    // Match ### Section
    const sectionMatch = line.match(/^### (.+)/);
    if (sectionMatch && current) {
      currentSection = { heading: sectionMatch[1], items: [] };
      current.sections.push(currentSection);
      continue;
    }
    // Match - item
    const itemMatch = line.match(/^- (.+)/);
    if (itemMatch && currentSection) {
      currentSection.items.push(itemMatch[1]);
    }
  }
  if (current) entries.push(current);
  return entries;
}

function EntryCard({ entry, defaultOpen }: { entry: ChangelogEntry; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="bg-white/[0.04] border border-white/10 rounded-2xl overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-3 px-5 py-3 hover:bg-white/[0.03] transition-colors"
      >
        <span className="px-2 py-0.5 rounded-lg bg-gradient-to-r from-blue-500/20 to-purple-500/20 text-blue-400 text-xs font-mono font-bold">
          {entry.version}
        </span>
        <span className="text-sm font-medium text-zinc-200">{entry.title}</span>
        <span className="ml-auto flex items-center gap-1.5 text-xs text-zinc-500">
          <Calendar className="w-3 h-3" />
          {entry.date}
        </span>
        {open ? <ChevronDown className="w-4 h-4 text-zinc-500" /> : <ChevronRight className="w-4 h-4 text-zinc-500" />}
      </button>
      {open && (
        <div className="px-5 pb-4 border-t border-white/[0.06] pt-3 space-y-3">
          {entry.sections.map((section, i) => (
            <div key={i}>
              <h4 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">{section.heading}</h4>
              <ul className="space-y-1">
                {section.items.map((item, j) => (
                  <li key={j} className="text-sm text-zinc-400 flex items-start gap-2">
                    <span className="text-blue-500 mt-1.5 w-1 h-1 rounded-full bg-blue-500 shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function ChangelogTab() {
  const [entries, setEntries] = useState<ChangelogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/CHANGELOG.md")
      .then((r) => r.text())
      .then((text) => {
        setEntries(parseChangelog(text));
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="text-zinc-500 text-sm py-8 text-center">Loading changelog...</div>;
  }

  if (entries.length === 0) {
    return (
      <div className="text-zinc-500 text-sm py-8 text-center">
        <Tag className="w-8 h-8 mx-auto mb-2 text-zinc-600" />
        <p>No changelog entries found.</p>
        <p className="text-xs text-zinc-600 mt-1">Create a CHANGELOG.md in the project root.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-lg font-semibold text-zinc-200">Changelog</h2>
        <span className="text-xs text-zinc-500">{entries.length} releases</span>
      </div>
      {entries.map((entry, i) => (
        <EntryCard key={entry.version} entry={entry} defaultOpen={i === 0} />
      ))}
    </div>
  );
}
