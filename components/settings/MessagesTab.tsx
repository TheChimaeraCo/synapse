"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useConfigSettings } from "@/lib/useConfigSettings";
import { Toggle } from "@/components/ui/toggle";

export function MessagesTab() {
  const { get, set, save, saving, loading } = useConfigSettings("messages.");

  if (loading) return <div className="text-zinc-400">Loading...</div>;

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h2 className="text-xl font-semibold text-white mb-1">Messages & Formatting</h2>
        <p className="text-sm text-zinc-400">Configure how messages are sent and formatted.</p>
      </div>

      <Card className="bg-white/[0.04] border-white/[0.06]">
        <CardHeader>
          <CardTitle className="text-sm text-zinc-300">Response Prefix</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-sm text-zinc-400 mb-1 block">Prefix (emoji or text prepended to all replies)</label>
            <Input
              value={get("response_prefix")}
              onChange={(e) => set("response_prefix", e.target.value)}
              placeholder="e.g. 🤖 or [Bot]"
              className="bg-white/[0.06] border-white/[0.08] text-white"
            />
          </div>
        </CardContent>
      </Card>

      <Card className="bg-white/[0.04] border-white/[0.06]">
        <CardHeader>
          <CardTitle className="text-sm text-zinc-300">Acknowledgment Reactions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-sm text-zinc-400 mb-1 block">Ack Reaction Emoji</label>
            <Input
              value={get("ack_emoji", "👀")}
              onChange={(e) => set("ack_emoji", e.target.value)}
              placeholder="👀"
              className="bg-white/[0.06] border-white/[0.08] text-white w-24"
            />
          </div>
          <div>
            <label className="text-sm text-zinc-400 mb-1 block">Ack Scope</label>
            <Select value={get("ack_scope", "all")} onValueChange={(val) => set("ack_scope", val)}>
              <SelectTrigger className="w-full bg-white/[0.04] border-white/[0.08] text-zinc-200 rounded-xl">
                <SelectValue placeholder="Select..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All messages</SelectItem>
                <SelectItem value="direct">Direct messages only</SelectItem>
                <SelectItem value="group-mentions">Group mentions only</SelectItem>
                <SelectItem value="group-all">All group messages</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Toggle
            checked={get("remove_ack_after_reply", "true") === "true"}
            onChange={(v) => set("remove_ack_after_reply", v ? "true" : "false")}
            label="Remove ack reaction after reply is sent"
          />
        </CardContent>
      </Card>

      <Card className="bg-white/[0.04] border-white/[0.06]">
        <CardHeader>
          <CardTitle className="text-sm text-zinc-300">Message Chunking</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-sm text-zinc-400 mb-1 block">Max Chunk Length</label>
            <Input
              type="number"
              value={get("chunk_limit", "4096")}
              onChange={(e) => set("chunk_limit", e.target.value)}
              className="bg-white/[0.06] border-white/[0.08] text-white"
            />
            <p className="text-xs text-zinc-500 mt-1">Maximum characters per message chunk for long responses.</p>
          </div>
          <div>
            <label className="text-sm text-zinc-400 mb-1 block">Chunk Mode</label>
            <Select value={get("chunk_mode", "newline")} onValueChange={(val) => set("chunk_mode", val)}>
              <SelectTrigger className="w-full bg-white/[0.04] border-white/[0.08] text-zinc-200 rounded-xl">
                <SelectValue placeholder="Select..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="length">Split by length</SelectItem>
                <SelectItem value="newline">Split at newlines</SelectItem>
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
