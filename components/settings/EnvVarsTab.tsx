"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useConfigSettings } from "@/lib/useConfigSettings";
import { X, Plus } from "lucide-react";
import { Toggle } from "@/components/ui/toggle";

export function EnvVarsTab() {
  const { get, set, save, saving, loading } = useConfigSettings("env.");
  const [newKey, setNewKey] = useState("");
  const [newValue, setNewValue] = useState("");

  if (loading) return <div className="text-zinc-400">Loading...</div>;

  const vars: Array<{ key: string; value: string }> = get("vars") ? JSON.parse(get("vars")) : [];

  const addVar = () => {
    if (!newKey) return;
    const updated = [...vars.filter(v => v.key !== newKey), { key: newKey, value: newValue }];
    set("vars", JSON.stringify(updated));
    setNewKey("");
    setNewValue("");
  };

  const removeVar = (key: string) => {
    set("vars", JSON.stringify(vars.filter(v => v.key !== key)));
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h2 className="text-xl font-semibold text-white mb-1">Environment Variables</h2>
        <p className="text-sm text-zinc-400">Manage environment variables for the gateway process.</p>
      </div>

      <Card className="bg-white/[0.04] border-white/[0.06]">
        <CardHeader>
          <CardTitle className="text-sm text-zinc-300">Settings</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Toggle
            checked={get("shell_loading", "true") === "true"}
            onChange={(v) => set("shell_loading", v ? "true" : "false")}
            label="Load shell environment on startup"
          />
          <div>
            <label className="text-sm text-zinc-400 mb-1 block">.env File Path</label>
            <Input
              value={get("dotenv_path")}
              onChange={(e) => set("dotenv_path", e.target.value)}
              placeholder="e.g. /root/.env (blank = default)"
              className="bg-white/[0.06] border-white/[0.08] text-white"
            />
          </div>
        </CardContent>
      </Card>

      <Card className="bg-white/[0.04] border-white/[0.06]">
        <CardHeader>
          <CardTitle className="text-sm text-zinc-300">Variables</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {vars.map((v) => (
            <div key={v.key} className="flex items-center gap-2 bg-white/[0.06] rounded-md px-3 py-2">
              <code className="text-blue-400 text-sm font-mono">{v.key}</code>
              <span className="text-zinc-600">=</span>
              <span className="text-sm text-zinc-300 flex-1 truncate font-mono">{v.value.includes("key") || v.value.includes("token") || v.value.includes("secret") ? "********" : v.value}</span>
              <button onClick={() => removeVar(v.key)} className="text-zinc-500 hover:text-red-400">
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
          <div className="flex gap-2">
            <Input
              placeholder="KEY"
              value={newKey}
              onChange={(e) => setNewKey(e.target.value.toUpperCase())}
              className="bg-white/[0.06] border-white/[0.08] text-white text-sm font-mono w-40"
            />
            <Input
              placeholder="value"
              value={newValue}
              onChange={(e) => setNewValue(e.target.value)}
              className="bg-white/[0.06] border-white/[0.08] text-white text-sm font-mono flex-1"
            />
            <Button onClick={addVar} size="sm" variant="outline" className="border-white/[0.08] text-zinc-300">
              <Plus className="w-4 h-4" />
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
