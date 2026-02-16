"use client";

import { useState, useEffect } from "react";
import { gatewayFetch } from "@/lib/gatewayFetch";
import { Button } from "@/components/ui/button";
import { Plus, Trash2, ToggleLeft, ToggleRight, ChevronDown, ChevronUp, Route } from "lucide-react";
import { toast } from "sonner";

interface RouteCondition {
  type: "message_length" | "has_code" | "keyword" | "combined";
  minLength?: number;
  maxLength?: number;
  codeDetection?: boolean;
  keywords?: string[];
}

interface ModelRoute {
  _id?: string;
  name: string;
  description: string;
  condition: RouteCondition;
  targetModel: string;
  priority: number;
  enabled: boolean;
}

const AVAILABLE_MODELS = [
  "claude-opus-4-20250514",
  "claude-sonnet-4-20250514",
  "claude-haiku-3-20250514",
  "gpt-4o",
  "gpt-4o-mini",
  "gemini-2.5-pro",
  "gemini-2.5-flash",
  "gemini-2.0-flash",
];

const CONDITION_TYPES = [
  { value: "message_length", label: "Message Length" },
  { value: "has_code", label: "Contains Code" },
  { value: "keyword", label: "Keyword Match" },
];

function RouteEditor({ route, onSave, onDelete }: {
  route: ModelRoute;
  onSave: (r: ModelRoute) => void;
  onDelete?: () => void;
}) {
  const [expanded, setExpanded] = useState(!route._id);
  const [form, setForm] = useState(route);

  return (
    <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-white/[0.02]" onClick={() => setExpanded(!expanded)}>
        <button
          className="shrink-0"
          onClick={(e) => {
            e.stopPropagation();
            setForm({ ...form, enabled: !form.enabled });
            onSave({ ...form, enabled: !form.enabled });
          }}
        >
          {form.enabled
            ? <ToggleRight className="h-5 w-5 text-green-400" />
            : <ToggleLeft className="h-5 w-5 text-zinc-600" />
          }
        </button>
        <div className="flex-1 min-w-0">
          <span className={`text-sm font-medium ${form.enabled ? 'text-zinc-200' : 'text-zinc-500'}`}>{form.name || "New Rule"}</span>
          <span className="text-xs text-zinc-500 ml-2">→ {form.targetModel}</span>
        </div>
        <span className="text-[10px] text-zinc-500 font-mono">P{form.priority}</span>
        {expanded ? <ChevronUp className="h-4 w-4 text-zinc-500" /> : <ChevronDown className="h-4 w-4 text-zinc-500" />}
      </div>

      {expanded && (
        <div className="px-4 pb-4 pt-2 border-t border-white/[0.06] space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1 block">Name</label>
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full bg-white/[0.04] border border-white/[0.1] rounded-lg px-3 py-1.5 text-sm text-zinc-200 focus:outline-none focus:border-blue-500/40"
              />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1 block">Priority</label>
              <input
                type="number"
                value={form.priority}
                onChange={(e) => setForm({ ...form, priority: parseInt(e.target.value) || 0 })}
                className="w-full bg-white/[0.04] border border-white/[0.1] rounded-lg px-3 py-1.5 text-sm text-zinc-200 focus:outline-none focus:border-blue-500/40"
              />
            </div>
          </div>

          <div>
            <label className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1 block">Description</label>
            <input
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="w-full bg-white/[0.04] border border-white/[0.1] rounded-lg px-3 py-1.5 text-sm text-zinc-200 focus:outline-none focus:border-blue-500/40"
            />
          </div>

          <div>
            <label className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1 block">Target Model</label>
            <select
              value={form.targetModel}
              onChange={(e) => setForm({ ...form, targetModel: e.target.value })}
              className="w-full bg-white/[0.04] border border-white/[0.1] rounded-lg px-3 py-1.5 text-sm text-zinc-200 focus:outline-none focus:border-blue-500/40"
            >
              {AVAILABLE_MODELS.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>

          <div>
            <label className="text-[10px] uppercase tracking-wider text-zinc-500 mb-1 block">Condition Type</label>
            <select
              value={form.condition.type}
              onChange={(e) => {
                const type = e.target.value as RouteCondition["type"];
                const base: RouteCondition = { type };
                if (type === "message_length") { base.maxLength = 50; }
                if (type === "has_code") { base.codeDetection = true; }
                if (type === "keyword") { base.keywords = []; }
                setForm({ ...form, condition: base });
              }}
              className="w-full bg-white/[0.04] border border-white/[0.1] rounded-lg px-3 py-1.5 text-sm text-zinc-200 focus:outline-none focus:border-blue-500/40"
            >
              {CONDITION_TYPES.map(ct => <option key={ct.value} value={ct.value}>{ct.label}</option>)}
            </select>
          </div>

          {form.condition.type === "message_length" && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] text-zinc-500 mb-1 block">Min Length</label>
                <input type="number" value={form.condition.minLength ?? ""} onChange={(e) => setForm({ ...form, condition: { ...form.condition, minLength: e.target.value ? parseInt(e.target.value) : undefined } })} className="w-full bg-white/[0.04] border border-white/[0.1] rounded-lg px-3 py-1.5 text-sm text-zinc-200 focus:outline-none" placeholder="0" />
              </div>
              <div>
                <label className="text-[10px] text-zinc-500 mb-1 block">Max Length</label>
                <input type="number" value={form.condition.maxLength ?? ""} onChange={(e) => setForm({ ...form, condition: { ...form.condition, maxLength: e.target.value ? parseInt(e.target.value) : undefined } })} className="w-full bg-white/[0.04] border border-white/[0.1] rounded-lg px-3 py-1.5 text-sm text-zinc-200 focus:outline-none" placeholder="No limit" />
              </div>
            </div>
          )}

          {form.condition.type === "has_code" && (
            <label className="flex items-center gap-2 text-sm text-zinc-300">
              <input type="checkbox" checked={form.condition.codeDetection ?? true} onChange={(e) => setForm({ ...form, condition: { ...form.condition, codeDetection: e.target.checked } })} className="rounded" />
              Match messages containing code
            </label>
          )}

          {form.condition.type === "keyword" && (
            <div>
              <label className="text-[10px] text-zinc-500 mb-1 block">Keywords (comma-separated)</label>
              <input
                value={(form.condition.keywords || []).join(", ")}
                onChange={(e) => setForm({ ...form, condition: { ...form.condition, keywords: e.target.value.split(",").map(s => s.trim()).filter(Boolean) } })}
                className="w-full bg-white/[0.04] border border-white/[0.1] rounded-lg px-3 py-1.5 text-sm text-zinc-200 focus:outline-none"
                placeholder="hello, hi, thanks"
              />
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            {onDelete && (
              <Button variant="ghost" size="sm" onClick={onDelete} className="text-red-400 hover:text-red-300 hover:bg-red-500/10">
                <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete
              </Button>
            )}
            <Button size="sm" onClick={() => onSave(form)} className="bg-blue-600 hover:bg-blue-500 text-white">
              Save Rule
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export function ModelRoutingTab() {
  const [routes, setRoutes] = useState<ModelRoute[]>([]);
  const [loading, setLoading] = useState(true);

  const loadRoutes = async () => {
    try {
      const res = await gatewayFetch("/api/config/models/routes");
      if (res.ok) setRoutes(await res.json());
    } catch {}
    setLoading(false);
  };

  useEffect(() => { loadRoutes(); }, []);

  const saveRoute = async (route: ModelRoute) => {
    try {
      if (route._id) {
        await gatewayFetch("/api/config/models/routes", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: route._id, ...route }),
        });
      } else {
        await gatewayFetch("/api/config/models/routes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(route),
        });
      }
      toast.success("Route saved");
      loadRoutes();
    } catch {
      toast.error("Failed to save route");
    }
  };

  const deleteRoute = async (id: string) => {
    try {
      await gatewayFetch(`/api/config/models/routes?id=${id}`, { method: "DELETE" });
      toast.success("Route deleted");
      loadRoutes();
    } catch {
      toast.error("Failed to delete route");
    }
  };

  const addDefault = () => {
    setRoutes([...routes, {
      name: "",
      description: "",
      condition: { type: "keyword", keywords: [] },
      targetModel: "claude-haiku-3-20250514",
      priority: 10,
      enabled: true,
    }]);
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-zinc-200 flex items-center gap-2">
          <Route className="h-5 w-5 text-blue-400" /> Model Routing Rules
        </h2>
        <p className="text-xs text-zinc-500 mt-1">
          Automatically route messages to different models based on content. Rules are evaluated by priority (highest first). First match wins.
        </p>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2].map(i => <div key={i} className="h-14 bg-white/[0.04] rounded-xl animate-pulse" />)}
        </div>
      ) : (
        <div className="space-y-3">
          {routes.map((route, i) => (
            <RouteEditor
              key={route._id || `new-${i}`}
              route={route}
              onSave={saveRoute}
              onDelete={route._id ? () => deleteRoute(route._id!) : undefined}
            />
          ))}
          {routes.length === 0 && (
            <div className="text-center py-8 text-zinc-500 text-sm">
              No routing rules configured. Messages will use the default model.
            </div>
          )}
        </div>
      )}

      <Button variant="ghost" onClick={addDefault} className="text-blue-400 hover:text-blue-300">
        <Plus className="h-4 w-4 mr-1" /> Add Rule
      </Button>
    </div>
  );
}
