"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useConfigSettings } from "@/lib/useConfigSettings";
import { X, Plus, Package } from "lucide-react";
import { Toggle } from "@/components/ui/toggle";

export function PluginsTab() {
  const { get, set, save, saving, loading } = useConfigSettings("plugins.");
  const [newPlugin, setNewPlugin] = useState("");

  if (loading) return <div className="text-zinc-400">Loading...</div>;

  const plugins: Array<{ name: string; source: string; enabled: boolean; config?: Record<string, string> }> =
    get("list") ? JSON.parse(get("list")) : [];

  const addPlugin = () => {
    if (!newPlugin) return;
    const updated = [...plugins, { name: newPlugin.split("/").pop() || newPlugin, source: newPlugin, enabled: true }];
    set("list", JSON.stringify(updated));
    setNewPlugin("");
  };

  const togglePlugin = (idx: number) => {
    const updated = plugins.map((p, i) => i === idx ? { ...p, enabled: !p.enabled } : p);
    set("list", JSON.stringify(updated));
  };

  const removePlugin = (idx: number) => {
    set("list", JSON.stringify(plugins.filter((_, i) => i !== idx)));
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h2 className="text-xl font-semibold text-white mb-1">Plugins</h2>
        <p className="text-sm text-zinc-400">Install, configure, and manage plugins.</p>
      </div>

      <Card className="bg-white/[0.04] border-white/[0.06]">
        <CardHeader>
          <CardTitle className="text-sm text-zinc-300">Installed Plugins</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {plugins.length === 0 && (
            <div className="text-center py-8 text-zinc-500">
              <Package className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No plugins installed</p>
            </div>
          )}
          {plugins.map((p, i) => (
            <div key={i} className="flex items-center gap-3 bg-white/[0.06] rounded-md px-3 py-3">
              <Toggle
                checked={p.enabled}
                onChange={() => togglePlugin(i)}
              />
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-white font-medium">{p.name}</span>
                  <Badge variant="outline" className={`text-xs ${p.enabled ? "border-green-800/40 text-green-400" : "border-white/[0.08] text-zinc-500"}`}>
                    {p.enabled ? "Active" : "Disabled"}
                  </Badge>
                </div>
                <p className="text-xs text-zinc-500 font-mono">{p.source}</p>
              </div>
              <button onClick={() => removePlugin(i)} className="text-zinc-500 hover:text-red-400">
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
          <div className="flex gap-2 pt-2">
            <Input
              placeholder="npm package or URL..."
              value={newPlugin}
              onChange={(e) => setNewPlugin(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addPlugin()}
              className="bg-white/[0.06] border-white/[0.08] text-white text-sm"
            />
            <Button onClick={addPlugin} size="sm" variant="outline" className="border-white/[0.08] text-zinc-300">
              <Plus className="w-4 h-4 mr-1" /> Install
            </Button>
          </div>
        </CardContent>
      </Card>

      <Button onClick={save} disabled={saving}>
        {saving ? "Saving..." : "Save Changes"}
      </Button>
    </div>
  );
}
