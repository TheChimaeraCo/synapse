"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useConfigSettings } from "@/lib/useConfigSettings";
import { Toggle } from "@/components/ui/toggle";

export function GatewayTab() {
  const { get, set, save, saving, loading } = useConfigSettings("gateway.");

  if (loading) return <div className="text-zinc-400">Loading...</div>;

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h2 className="text-xl font-semibold text-white mb-1">Gateway</h2>
        <p className="text-sm text-zinc-400">Configure gateway server, auth, and network settings.</p>
      </div>

      <Card className="bg-white/[0.04] border-white/[0.06]">
        <CardHeader>
          <CardTitle className="text-sm text-zinc-300">Server</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-sm text-zinc-400 mb-1 block">Gateway Name</label>
            <Input
              value={get("name", "synapse")}
              onChange={(e) => set("name", e.target.value)}
              className="bg-white/[0.06] border-white/[0.08] text-white"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm text-zinc-400 mb-1 block">Bind Address</label>
              <Input
                value={get("bind", "0.0.0.0")}
                onChange={(e) => set("bind", e.target.value)}
                className="bg-white/[0.06] border-white/[0.08] text-white"
              />
            </div>
            <div>
              <label className="text-sm text-zinc-400 mb-1 block">Port</label>
              <Input
                type="number"
                value={get("port", "3020")}
                onChange={(e) => set("port", e.target.value)}
                className="bg-white/[0.06] border-white/[0.08] text-white"
              />
            </div>
          </div>
          <div>
            <label className="text-sm text-zinc-400 mb-1 block">Mode</label>
            <Select value={get("mode", "local")} onValueChange={(val) => set("mode", val)}>
              <SelectTrigger className="w-full bg-white/[0.04] border-white/[0.08] text-zinc-200 rounded-xl">
                <SelectValue placeholder="Select..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="local">Local</SelectItem>
                <SelectItem value="remote">Remote</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-white/[0.04] border-white/[0.06]">
        <CardHeader>
          <CardTitle className="text-sm text-zinc-300">Auth & Security</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-sm text-zinc-400 mb-1 block">Auth Token</label>
            <Input
              type="password"
              value={get("auth_token")}
              onChange={(e) => set("auth_token", e.target.value)}
              placeholder="Leave blank for no auth"
              className="bg-white/[0.06] border-white/[0.08] text-white"
            />
          </div>
          <div>
            <label className="text-sm text-zinc-400 mb-1 block">CORS Allowed Origins (comma-separated)</label>
            <Input
              value={get("cors_origins", "*")}
              onChange={(e) => set("cors_origins", e.target.value)}
              placeholder="* or https://example.com"
              className="bg-white/[0.06] border-white/[0.08] text-white"
            />
          </div>
          <div>
            <label className="text-sm text-zinc-400 mb-1 block">Rate Limit (requests/min, 0 = unlimited)</label>
            <Input
              type="number"
              value={get("rate_limit", "0")}
              onChange={(e) => set("rate_limit", e.target.value)}
              className="bg-white/[0.06] border-white/[0.08] text-white"
            />
          </div>
        </CardContent>
      </Card>

      <Card className="bg-white/[0.04] border-white/[0.06]">
        <CardHeader>
          <CardTitle className="text-sm text-zinc-300">Discovery & Network</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Toggle
            checked={get("mdns_broadcast", "false") === "true"}
            onChange={(v) => set("mdns_broadcast", v ? "true" : "false")}
            label="Enable mDNS broadcast (local network discovery)"
          />
          <Toggle
            checked={get("dns_sd", "false") === "true"}
            onChange={(v) => set("dns_sd", v ? "true" : "false")}
            label="Enable wide-area DNS-SD"
          />
          <Toggle
            checked={get("tailscale", "false") === "true"}
            onChange={(v) => set("tailscale", v ? "true" : "false")}
            label="Tailscale integration"
          />
        </CardContent>
      </Card>

      <Card className="bg-white/[0.04] border-white/[0.06]">
        <CardHeader>
          <CardTitle className="text-sm text-zinc-300">Advanced</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Toggle
            checked={get("hot_reload", "true") === "true"}
            onChange={(v) => set("hot_reload", v ? "true" : "false")}
            label="Config hot reload"
          />
          <div>
            <label className="text-sm text-zinc-400 mb-1 block">Instance Isolation ID</label>
            <Input
              value={get("isolation_id")}
              onChange={(e) => set("isolation_id", e.target.value)}
              placeholder="Leave blank for default"
              className="bg-white/[0.06] border-white/[0.08] text-white"
            />
            <p className="text-xs text-zinc-500 mt-1">Used to isolate multiple gateway instances on the same host.</p>
          </div>
        </CardContent>
      </Card>

      <Button onClick={save} disabled={saving}>
        {saving ? "Saving..." : "Save Changes"}
      </Button>
    </div>
  );
}
