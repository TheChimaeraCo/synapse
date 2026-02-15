"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useConfigSettings } from "@/lib/useConfigSettings";

export function SessionsTab() {
  const { get, set, save, saving, loading } = useConfigSettings("session.");

  if (loading) return <div className="text-zinc-400">Loading...</div>;

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h2 className="text-xl font-semibold text-white mb-1">Sessions</h2>
        <p className="text-sm text-zinc-400">Configure session behavior, compaction, and lifecycle.</p>
      </div>

      <Card className="bg-white/[0.04] border-white/[0.06]">
        <CardHeader>
          <CardTitle className="text-sm text-zinc-300">Session Mode</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-sm text-zinc-400 mb-1 block">Mode</label>
            <Select value={get("mode", "per-sender")} onValueChange={(val) => set("mode", val)}>
              <SelectTrigger className="w-full bg-white/[0.04] border-white/[0.08] text-zinc-200 rounded-xl">
                <SelectValue placeholder="Select..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="per-sender">Per Sender</SelectItem>
                <SelectItem value="per-group">Per Group</SelectItem>
                <SelectItem value="shared">Shared (single session)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-white/[0.04] border-white/[0.06]">
        <CardHeader>
          <CardTitle className="text-sm text-zinc-300">Compaction</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-sm text-zinc-400 mb-1 block">Max Turns Before Compaction</label>
            <Input
              type="number"
              value={get("compact_max_turns", "50")}
              onChange={(e) => set("compact_max_turns", e.target.value)}
              className="bg-white/[0.06] border-white/[0.08] text-white"
            />
          </div>
          <div>
            <label className="text-sm text-zinc-400 mb-1 block">Max Tokens Before Compaction</label>
            <Input
              type="number"
              value={get("compact_max_tokens", "100000")}
              onChange={(e) => set("compact_max_tokens", e.target.value)}
              className="bg-white/[0.06] border-white/[0.08] text-white"
            />
          </div>
        </CardContent>
      </Card>

      <Card className="bg-white/[0.04] border-white/[0.06]">
        <CardHeader>
          <CardTitle className="text-sm text-zinc-300">Lifecycle</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-sm text-zinc-400 mb-1 block">Session Timeout (minutes, 0 = no timeout)</label>
            <Input
              type="number"
              value={get("timeout_minutes", "0")}
              onChange={(e) => set("timeout_minutes", e.target.value)}
              className="bg-white/[0.06] border-white/[0.08] text-white"
            />
          </div>
          <div>
            <label className="text-sm text-zinc-400 mb-1 block">Max Concurrent Sessions</label>
            <Input
              type="number"
              value={get("max_concurrent", "100")}
              onChange={(e) => set("max_concurrent", e.target.value)}
              className="bg-white/[0.06] border-white/[0.08] text-white"
            />
          </div>
          <div>
            <label className="text-sm text-zinc-400 mb-1 block">Auto-Prune After (days, 0 = never)</label>
            <Input
              type="number"
              value={get("prune_after_days", "0")}
              onChange={(e) => set("prune_after_days", e.target.value)}
              className="bg-white/[0.06] border-white/[0.08] text-white"
            />
          </div>
        </CardContent>
      </Card>

      <Button onClick={save} disabled={saving}>
        {saving ? "Saving..." : "Save Changes"}
      </Button>
    </div>
  );
}
