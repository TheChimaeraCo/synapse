"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useConfigSettings } from "@/lib/useConfigSettings";
import { X, Plus } from "lucide-react";

export function SandboxTab() {
  const { get, set, save, saving, loading } = useConfigSettings("sandbox.");
  const [newCmd, setNewCmd] = useState("");

  if (loading) return <div className="text-zinc-400">Loading...</div>;

  const blockedCmds = get("blocked_commands") ? get("blocked_commands").split(",") : [];
  const allowedCmds = get("allowed_commands") ? get("allowed_commands").split(",") : [];

  const addToList = (listKey: string, list: string[], value: string) => {
    if (!value) return;
    set(listKey, [...list, value].join(","));
    setNewCmd("");
  };

  const removeFromList = (listKey: string, list: string[], idx: number) => {
    set(listKey, list.filter((_, i) => i !== idx).join(","));
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h2 className="text-xl font-semibold text-white mb-1">Sandbox / Execution</h2>
        <p className="text-sm text-zinc-400">Configure code execution sandboxing and security.</p>
      </div>

      <Card className="bg-white/[0.04] border-white/[0.06]">
        <CardHeader>
          <CardTitle className="text-sm text-zinc-300">Sandbox Mode</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-sm text-zinc-400 mb-1 block">Mode</label>
            <Select value={get("mode", "off")} onValueChange={(val) => set("mode", val)}>
              <SelectTrigger className="w-full bg-white/[0.04] border-white/[0.08] text-zinc-200 rounded-xl">
                <SelectValue placeholder="Select..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="off">Off (direct execution)</SelectItem>
                <SelectItem value="all">All commands sandboxed</SelectItem>
                <SelectItem value="untrusted">Untrusted only</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-sm text-zinc-400 mb-1 block">Scope</label>
            <Select value={get("scope", "session")} onValueChange={(val) => set("scope", val)}>
              <SelectTrigger className="w-full bg-white/[0.04] border-white/[0.08] text-zinc-200 rounded-xl">
                <SelectValue placeholder="Select..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="session">Per session</SelectItem>
                <SelectItem value="global">Global (shared)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-sm text-zinc-400 mb-1 block">Docker Image</label>
            <Input
              value={get("docker_image")}
              onChange={(e) => set("docker_image", e.target.value)}
              placeholder="e.g. node:20-slim"
              className="bg-white/[0.06] border-white/[0.08] text-white"
            />
          </div>
        </CardContent>
      </Card>

      <Card className="bg-white/[0.04] border-white/[0.06]">
        <CardHeader>
          <CardTitle className="text-sm text-zinc-300">Resource Limits</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm text-zinc-400 mb-1 block">CPU Cores</label>
              <Input
                type="number"
                value={get("cpu_limit", "2")}
                onChange={(e) => set("cpu_limit", e.target.value)}
                className="bg-white/[0.06] border-white/[0.08] text-white"
              />
            </div>
            <div>
              <label className="text-sm text-zinc-400 mb-1 block">Memory (MB)</label>
              <Input
                type="number"
                value={get("memory_limit", "512")}
                onChange={(e) => set("memory_limit", e.target.value)}
                className="bg-white/[0.06] border-white/[0.08] text-white"
              />
            </div>
            <div>
              <label className="text-sm text-zinc-400 mb-1 block">Disk (MB)</label>
              <Input
                type="number"
                value={get("disk_limit", "1024")}
                onChange={(e) => set("disk_limit", e.target.value)}
                className="bg-white/[0.06] border-white/[0.08] text-white"
              />
            </div>
            <div>
              <label className="text-sm text-zinc-400 mb-1 block">Network</label>
              <Select value={get("network", "enabled")} onValueChange={(val) => set("network", val)}>
                <SelectTrigger className="w-full bg-white/[0.04] border-white/[0.08] text-zinc-200 rounded-xl">
                  <SelectValue placeholder="Select..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="enabled">Enabled</SelectItem>
                  <SelectItem value="disabled">Disabled</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-white/[0.04] border-white/[0.06]">
        <CardHeader>
          <CardTitle className="text-sm text-zinc-300">Command Controls</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-sm text-zinc-400 mb-2 block">Blocked Commands</label>
            <div className="flex flex-wrap gap-2 mb-2">
              {blockedCmds.filter(Boolean).map((cmd: string, i: number) => (
                <Badge key={i} variant="outline" className="border-red-800/40 text-red-400">
                  {cmd}
                  <button onClick={() => removeFromList("blocked_commands", blockedCmds, i)} className="ml-1">
                    <X className="w-3 h-3" />
                  </button>
                </Badge>
              ))}
            </div>
            <div className="flex gap-2">
              <Input
                placeholder="e.g. rm -rf"
                value={newCmd}
                onChange={(e) => setNewCmd(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addToList("blocked_commands", blockedCmds, newCmd)}
                className="bg-white/[0.06] border-white/[0.08] text-white text-sm"
              />
              <Button onClick={() => addToList("blocked_commands", blockedCmds, newCmd)} size="sm" variant="outline" className="border-white/[0.08] text-zinc-300">
                <Plus className="w-4 h-4" />
              </Button>
            </div>
          </div>
          <div>
            <label className="text-sm text-zinc-400 mb-1 block">Exec Approval Requirement</label>
            <Select value={get("exec_approval", "none")} onValueChange={(val) => set("exec_approval", val)}>
              <SelectTrigger className="w-full bg-white/[0.04] border-white/[0.08] text-zinc-200 rounded-xl">
                <SelectValue placeholder="Select..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No approval needed</SelectItem>
                <SelectItem value="destructive">Destructive commands only</SelectItem>
                <SelectItem value="all">All commands require approval</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-sm text-zinc-400 mb-1 block">Tool Policy</label>
            <Select value={get("tool_policy", "allowlist")} onValueChange={(val) => set("tool_policy", val)}>
              <SelectTrigger className="w-full bg-white/[0.04] border-white/[0.08] text-zinc-200 rounded-xl">
                <SelectValue placeholder="Select..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="allowlist">Allowlist (only listed tools)</SelectItem>
                <SelectItem value="blocklist">Blocklist (all except listed)</SelectItem>
                <SelectItem value="all">All tools allowed</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Button onClick={save} disabled={saving}>
        {saving ? "Saving..." : "Save Changes"}
      </Button>
    </div>
  );
}
