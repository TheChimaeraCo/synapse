"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useConfigSettings } from "@/lib/useConfigSettings";
import { Toggle } from "@/components/ui/toggle";
import { gatewayFetch } from "@/lib/gatewayFetch";
import { useState } from "react";

export function GatewayTab() {
  const { get, set, save: saveGateway, saving: savingGateway, loading: loadingGateway } = useConfigSettings("gateway.");
  const { get: getGit, set: setGit, save: saveGit, saving: savingGit, loading: loadingGit } = useConfigSettings("git.");
  const [checkingGit, setCheckingGit] = useState(false);
  const [gitStatus, setGitStatus] = useState<any>(null);

  if (loadingGateway || loadingGit) return <div className="text-zinc-400">Loading...</div>;

  const save = async () => {
    await saveGateway();
    await saveGit();
  };

  const checkGitStatus = async () => {
    setCheckingGit(true);
    try {
      const res = await gatewayFetch("/api/config/git-auth/status");
      const data = await res.json().catch(() => ({}));
      setGitStatus(data);
    } finally {
      setCheckingGit(false);
    }
  };

  const gitMode = getGit("auth_mode", "cli_oauth");

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

      <Card className="bg-white/[0.04] border-white/[0.06]">
        <CardHeader>
          <CardTitle className="text-sm text-zinc-300">Git Access</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-sm text-zinc-400 mb-1 block">Authentication Mode</label>
            <Select value={gitMode} onValueChange={(val) => setGit("auth_mode", val)}>
              <SelectTrigger className="w-full bg-white/[0.04] border-white/[0.08] text-zinc-200 rounded-xl">
                <SelectValue placeholder="Select..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="cli_oauth">GitHub CLI OAuth (easy)</SelectItem>
                <SelectItem value="github_app">GitHub App (production)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {gitMode === "cli_oauth" && (
            <div className="rounded-lg border border-white/[0.08] bg-white/[0.03] p-3 space-y-2">
              <p className="text-sm text-zinc-200">Run this once on the host:</p>
              <code className="block text-xs text-zinc-300 bg-black/30 rounded p-2">gh auth login --web --git-protocol https</code>
              <code className="block text-xs text-zinc-300 bg-black/30 rounded p-2">gh auth status</code>
            </div>
          )}

          {gitMode === "github_app" && (
            <div className="space-y-3">
              <div>
                <label className="text-sm text-zinc-400 mb-1 block">GitHub Host</label>
                <Input
                  value={getGit("github_host", "github.com")}
                  onChange={(e) => setGit("github_host", e.target.value)}
                  placeholder="github.com"
                  className="bg-white/[0.06] border-white/[0.08] text-white"
                />
              </div>
              <div>
                <label className="text-sm text-zinc-400 mb-1 block">GitHub App ID</label>
                <Input
                  value={getGit("github_app_id")}
                  onChange={(e) => setGit("github_app_id", e.target.value)}
                  placeholder="e.g. 1234567"
                  className="bg-white/[0.06] border-white/[0.08] text-white"
                />
              </div>
              <div>
                <label className="text-sm text-zinc-400 mb-1 block">Installation ID</label>
                <Input
                  value={getGit("github_app_installation_id")}
                  onChange={(e) => setGit("github_app_installation_id", e.target.value)}
                  placeholder="e.g. 987654321"
                  className="bg-white/[0.06] border-white/[0.08] text-white"
                />
              </div>
              <div>
                <label className="text-sm text-zinc-400 mb-1 block">App Private Key (PEM)</label>
                <textarea
                  rows={6}
                  value={getGit("github_app_private_key")}
                  onChange={(e) => setGit("github_app_private_key", e.target.value)}
                  placeholder="-----BEGIN PRIVATE KEY-----"
                  className="w-full rounded-md border border-white/[0.08] bg-white/[0.06] px-3 py-2 text-sm text-white focus:outline-none font-mono"
                />
              </div>
            </div>
          )}

          <div className="flex items-center gap-2">
            <Button variant="outline" className="border-white/[0.08] text-zinc-300" onClick={checkGitStatus} disabled={checkingGit}>
              {checkingGit ? "Checking..." : "Check Git Auth Status"}
            </Button>
            {gitStatus?.ready === true && <span className="text-xs text-emerald-400">Ready</span>}
            {gitStatus?.ready === false && <span className="text-xs text-amber-400">Not ready</span>}
          </div>
          {gitStatus?.message && <p className="text-xs text-zinc-500">{gitStatus.message}</p>}
          {Array.isArray(gitStatus?.missing) && gitStatus.missing.length > 0 && (
            <p className="text-xs text-amber-400">Missing: {gitStatus.missing.join(", ")}</p>
          )}
          {gitStatus?.error && <p className="text-xs text-red-400">{gitStatus.error}</p>}
        </CardContent>
      </Card>

      <Button onClick={save} disabled={savingGateway || savingGit}>
        {savingGateway || savingGit ? "Saving..." : "Save Changes"}
      </Button>
    </div>
  );
}
