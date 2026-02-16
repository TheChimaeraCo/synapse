"use client";
import { gatewayFetch } from "@/lib/gatewayFetch";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";

interface ToolRecord {
  _id: string;
  name: string;
  description: string;
  category: string;
  enabled: boolean;
  requiresApproval: boolean;
}

const CATEGORY_COLORS: Record<string, string> = {
  search: "bg-blue-500/20 text-blue-400",
  system: "bg-green-500/20 text-green-400",
  code: "bg-purple-500/20 text-purple-400",
  file: "bg-yellow-500/20 text-yellow-400",
};

export function ToolsTab() {
  const { data: session } = useSession();
  const [tools, setTools] = useState<ToolRecord[]>([]);
  const [loading, setLoading] = useState(true);

  const gatewayId = (session?.user as any)?.gatewayId;

  useEffect(() => {
    if (!gatewayId) return;
    gatewayFetch(`/api/tools?gatewayId=${gatewayId}`)
      .then((r) => r.json())
      .then((d) => setTools(d.tools || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [gatewayId]);

  async function toggleEnabled(tool: ToolRecord) {
    const newVal = !tool.enabled;
    setTools((prev) =>
      prev.map((t) => (t._id === tool._id ? { ...t, enabled: newVal } : t))
    );
    await gatewayFetch("/api/tools", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: tool._id, enabled: newVal }),
    });
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-white">Tools<HelpTooltip title="Tools" content="Tools extend your AI with abilities like web search, code execution, and file access. Enable or disable tools per channel." /></h2>
          <p className="text-sm text-zinc-400 mt-1">
            Enable or disable tools the AI agent can use during conversations.
          </p>
        </div>
        <button
          onClick={async () => {
            try {
              const res = await gatewayFetch("/api/tools/cache", { method: "DELETE" });
              const data = await res.json();
              alert(`Cleared ${data.deleted || 0} cached tool results`);
            } catch { alert("Failed to clear cache"); }
          }}
          className="shrink-0 px-3 py-1.5 text-xs rounded-lg bg-white/[0.06] border border-white/[0.08] text-zinc-300 hover:bg-white/[0.1] transition-all"
        >
          Clear Tool Cache
        </button>
      </div>

      <div className="space-y-3">
        {tools.map((tool) => (
          <div
            key={tool._id}
            className="flex items-center justify-between p-4 rounded-lg bg-white/[0.04] border border-white/[0.08]"
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-medium text-white">{tool.name}</span>
                <span
                  className={`text-xs px-2 py-0.5 rounded-full ${CATEGORY_COLORS[tool.category] || "bg-white/[0.10]/20 text-zinc-400"}`}
                >
                  {tool.category}
                </span>
                {tool.requiresApproval && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-orange-500/20 text-orange-400">
                    Requires Approval
                  </span>
                )}
              </div>
              <p className="text-sm text-zinc-400 mt-1">{tool.description}</p>
            </div>
            <button
              onClick={() => toggleEnabled(tool)}
              className={`ml-4 relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                tool.enabled ? "bg-gradient-to-r from-blue-500 to-purple-500 shadow-[0_0_12px_rgba(59,130,246,0.25)]" : "bg-white/[0.12]"
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  tool.enabled ? "translate-x-6" : "translate-x-1"
                }`}
              />
            </button>
          </div>
        ))}

        {tools.length === 0 && (
          <p className="text-zinc-500 text-center py-8">
            No tools configured. They will be seeded automatically.
          </p>
        )}
      </div>
    </div>
  );
}
import { HelpTooltip } from "@/components/HelpTooltip";
