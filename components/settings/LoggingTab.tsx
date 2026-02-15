"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useConfigSettings } from "@/lib/useConfigSettings";
import { X, Plus } from "lucide-react";
import { Toggle } from "@/components/ui/toggle";

export function LoggingTab() {
  const { get, set, save, saving, loading } = useConfigSettings("logging.");
  const [newPattern, setNewPattern] = useState("");

  if (loading) return <div className="text-zinc-400">Loading...</div>;

  const redactPatterns = get("redact_patterns") ? get("redact_patterns").split("|||") : [];

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h2 className="text-xl font-semibold text-white mb-1">Logging</h2>
        <p className="text-sm text-zinc-400">Configure log levels, output format, and data redaction.</p>
      </div>

      <Card className="bg-white/[0.04] border-white/[0.06]">
        <CardHeader>
          <CardTitle className="text-sm text-zinc-300">Output</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-sm text-zinc-400 mb-1 block">Log Level</label>
            <Select value={get("level", "info")} onValueChange={(val) => set("level", val)}>
              <SelectTrigger className="w-full bg-white/[0.04] border-white/[0.08] text-zinc-200 rounded-xl">
                <SelectValue placeholder="Select..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="debug">Debug</SelectItem>
                <SelectItem value="info">Info</SelectItem>
                <SelectItem value="warn">Warn</SelectItem>
                <SelectItem value="error">Error</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-sm text-zinc-400 mb-1 block">Console Style</label>
            <Select value={get("style", "pretty")} onValueChange={(val) => set("style", val)}>
              <SelectTrigger className="w-full bg-white/[0.04] border-white/[0.08] text-zinc-200 rounded-xl">
                <SelectValue placeholder="Select..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pretty">Pretty</SelectItem>
                <SelectItem value="compact">Compact</SelectItem>
                <SelectItem value="json">JSON</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-sm text-zinc-400 mb-1 block">Log File Path</label>
            <Input
              value={get("file_path")}
              onChange={(e) => set("file_path", e.target.value)}
              placeholder="e.g. /var/log/synapse.log (blank = stdout only)"
              className="bg-white/[0.06] border-white/[0.08] text-white"
            />
          </div>
        </CardContent>
      </Card>

      <Card className="bg-white/[0.04] border-white/[0.06]">
        <CardHeader>
          <CardTitle className="text-sm text-zinc-300">Data Redaction</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Toggle
            checked={get("redact_sensitive", "true") === "true"}
            onChange={(v) => set("redact_sensitive", v ? "true" : "false")}
            label="Redact sensitive data (API keys, tokens, passwords)"
          />
          <div>
            <label className="text-sm text-zinc-400 mb-2 block">Custom Redact Patterns (regex)</label>
            <div className="flex flex-wrap gap-2 mb-2">
              {redactPatterns.filter(Boolean).map((p: string, i: number) => (
                <Badge key={i} variant="outline" className="border-white/[0.10] text-zinc-400 font-mono text-xs">
                  {p}
                  <button onClick={() => set("redact_patterns", redactPatterns.filter((_: any, j: number) => j !== i).join("|||"))} className="ml-1">
                    <X className="w-3 h-3" />
                  </button>
                </Badge>
              ))}
            </div>
            <div className="flex gap-2">
              <Input
                placeholder="e.g. sk-[a-zA-Z0-9]+"
                value={newPattern}
                onChange={(e) => setNewPattern(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && newPattern) {
                    set("redact_patterns", [...redactPatterns, newPattern].join("|||"));
                    setNewPattern("");
                  }
                }}
                className="bg-white/[0.06] border-white/[0.08] text-white text-sm font-mono"
              />
              <Button
                onClick={() => {
                  if (newPattern) {
                    set("redact_patterns", [...redactPatterns, newPattern].join("|||"));
                    setNewPattern("");
                  }
                }}
                size="sm" variant="outline" className="border-white/[0.08] text-zinc-300"
              >
                <Plus className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Button onClick={save} disabled={saving}>
        {saving ? "Saving..." : "Save Changes"}
      </Button>
    </div>
  );
}
