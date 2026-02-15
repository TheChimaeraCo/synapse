"use client";
import { gatewayFetch } from "@/lib/gatewayFetch";

import { useState, useEffect } from "react";
import { Puzzle, Search, Download, Trash2, RefreshCw } from "lucide-react";

interface Skill {
  _id: string;
  name: string;
  description: string;
  version: string;
  author: string;
  category: string;
  status: string;
  functions: { name: string; description: string; parameters: string }[];
  triggers?: { type: string; value: string }[];
}

const CATEGORY_COLORS: Record<string, string> = {
  utility: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  knowledge: "bg-purple-500/10 text-purple-400 border-purple-500/20",
  communication: "bg-green-500/10 text-green-400 border-green-500/20",
  default: "bg-white/[0.06] text-zinc-400 border-white/[0.08]",
};

function CategoryBadge({ category }: { category: string }) {
  const color = CATEGORY_COLORS[category] || CATEGORY_COLORS.default;
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs border ${color}`}>
      {category}
    </span>
  );
}

function SkillCard({ skill, onAction }: { skill: Skill; onAction: (action: string, id: string) => void }) {
  const isInstalled = skill.status === "installed";
  return (
    <div className="border border-white/[0.08]/50 rounded-lg p-4 bg-white/[0.04] hover:border-white/[0.10] transition-colors">
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2">
          <Puzzle className="w-4 h-4 text-blue-400" />
          <h3 className="font-medium text-white">{skill.name}</h3>
          <span className="text-xs text-zinc-500">v{skill.version}</span>
        </div>
        <CategoryBadge category={skill.category} />
      </div>
      <p className="text-sm text-zinc-400 mb-3">{skill.description}</p>
      <div className="flex items-center justify-between">
        <span className="text-xs text-zinc-500">
          {skill.functions.length} function{skill.functions.length !== 1 ? "s" : ""} - by {skill.author}
        </span>
        <button
          onClick={() => onAction(isInstalled ? "uninstall" : "install", skill._id)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
            isInstalled
              ? "bg-red-500/10 text-red-400 hover:bg-red-500/20"
              : "bg-blue-500/10 text-blue-400 hover:bg-blue-500/20"
          }`}
        >
          {isInstalled ? <Trash2 className="w-3 h-3" /> : <Download className="w-3 h-3" />}
          {isInstalled ? "Uninstall" : "Install"}
        </button>
      </div>
    </div>
  );
}

export function SkillsTab() {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  const fetchSkills = async () => {
    setLoading(true);
    try {
      const res = await gatewayFetch("/api/skills");
      const data = await res.json();
      setSkills(data.skills || []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchSkills(); }, []);

  const handleAction = async (action: string, id: string) => {
    try {
      await gatewayFetch("/api/skills", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, id }),
      });
      fetchSkills();
    } catch {
      // ignore
    }
  };

  const filtered = skills.filter((s) =>
    !search || s.name.toLowerCase().includes(search.toLowerCase()) || s.description.toLowerCase().includes(search.toLowerCase())
  );
  const installed = filtered.filter((s) => s.status === "installed");
  const available = filtered.filter((s) => s.status !== "installed");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-white">Skills</h2>
          <p className="text-sm text-zinc-400">Extend your AI with installable capabilities</p>
        </div>
        <button onClick={fetchSkills} className="p-2 rounded-md hover:bg-white/[0.06] text-zinc-400 hover:text-white transition-colors">
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
        <input
          type="text"
          placeholder="Search skills..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-10 pr-4 py-2 bg-white/[0.06] border border-white/[0.08] rounded-md text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      </div>

      {installed.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-zinc-300 mb-3">Installed ({installed.length})</h3>
          <div className="grid gap-3">
            {installed.map((s) => <SkillCard key={s._id} skill={s} onAction={handleAction} />)}
          </div>
        </div>
      )}

      {available.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-zinc-300 mb-3">Available ({available.length})</h3>
          <div className="grid gap-3">
            {available.map((s) => <SkillCard key={s._id} skill={s} onAction={handleAction} />)}
          </div>
        </div>
      )}

      {!loading && filtered.length === 0 && (
        <div className="text-center py-8 text-zinc-500">
          <Puzzle className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p>No skills found</p>
        </div>
      )}
    </div>
  );
}
