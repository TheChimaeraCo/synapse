"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useConfigSettings } from "@/lib/useConfigSettings";
import { Toggle } from "@/components/ui/toggle";

export function BrowserTab() {
  const { get, set, save, saving, loading } = useConfigSettings("browser.");

  if (loading) return <div className="text-zinc-400">Loading...</div>;

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h2 className="text-xl font-semibold text-white mb-1">Browser</h2>
        <p className="text-sm text-zinc-400">Configure browser automation settings.</p>
      </div>

      <Card className="bg-white/[0.04] border-white/[0.06]">
        <CardHeader>
          <CardTitle className="text-sm text-zinc-300">Browser Engine</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-sm text-zinc-400 mb-1 block">Mode</label>
            <Select value={get("mode", "chromium")} onValueChange={(val) => set("mode", val)}>
              <SelectTrigger className="w-full bg-white/[0.04] border-white/[0.08] text-zinc-200 rounded-xl">
                <SelectValue placeholder="Select..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="chromium">Chromium (Playwright)</SelectItem>
                <SelectItem value="chrome">Chrome (system)</SelectItem>
                <SelectItem value="firefox">Firefox</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Toggle
            checked={get("headless", "true") === "true"}
            onChange={(v) => set("headless", v ? "true" : "false")}
            label="Headless mode"
          />
        </CardContent>
      </Card>

      <Card className="bg-white/[0.04] border-white/[0.06]">
        <CardHeader>
          <CardTitle className="text-sm text-zinc-300">Proxy</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-sm text-zinc-400 mb-1 block">Proxy URL</label>
            <Input
              value={get("proxy_url")}
              onChange={(e) => set("proxy_url", e.target.value)}
              placeholder="e.g. http://proxy:8080"
              className="bg-white/[0.06] border-white/[0.08] text-white"
            />
          </div>
          <div>
            <label className="text-sm text-zinc-400 mb-1 block">Proxy Username</label>
            <Input
              value={get("proxy_user")}
              onChange={(e) => set("proxy_user", e.target.value)}
              className="bg-white/[0.06] border-white/[0.08] text-white"
            />
          </div>
          <div>
            <label className="text-sm text-zinc-400 mb-1 block">Proxy Password</label>
            <Input
              type="password"
              value={get("proxy_pass")}
              onChange={(e) => set("proxy_pass", e.target.value)}
              className="bg-white/[0.06] border-white/[0.08] text-white"
            />
          </div>
        </CardContent>
      </Card>

      <Card className="bg-white/[0.04] border-white/[0.06]">
        <CardHeader>
          <CardTitle className="text-sm text-zinc-300">Chrome Extension Relay</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Toggle
            checked={get("relay_enabled", "false") === "true"}
            onChange={(v) => set("relay_enabled", v ? "true" : "false")}
            label="Enable Chrome extension relay"
          />
          <div>
            <label className="text-sm text-zinc-400 mb-1 block">Relay Port</label>
            <Input
              type="number"
              value={get("relay_port", "9222")}
              onChange={(e) => set("relay_port", e.target.value)}
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
