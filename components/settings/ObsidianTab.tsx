"use client";

import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { gatewayFetch } from "@/lib/gatewayFetch";
import { useFetch } from "@/lib/hooks";
import { toast } from "sonner";
import { Download, RefreshCw, ShieldCheck } from "lucide-react";

interface ObsidianSetupResponse {
  gatewayId: string;
  gatewaySlug: string;
  gatewayName: string;
  synapseBaseUrl: string;
  syncEndpoint: string;
  liveSyncProxyEndpoint: string;
  defaultVaultPath: string;
  tokenConfigured: boolean;
  tokenPreview: string;
  pluginId: string;
  pluginInstallPath: string;
}

function copyToClipboard(value: string, label: string) {
  if (!value) return;
  navigator.clipboard
    .writeText(value)
    .then(() => toast.success(`${label} copied`))
    .catch(() => toast.error(`Failed to copy ${label}`));
}

function downloadPluginFile(file: string) {
  const url = `/api/sync/obsidian/plugin?file=${encodeURIComponent(file)}`;
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = file;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
}

export function ObsidianTab() {
  const { data, loading, error, refetch } = useFetch<ObsidianSetupResponse>("/api/sync/obsidian/setup");
  const [token, setToken] = useState("");
  const [vaultPath, setVaultPath] = useState("");
  const [busy, setBusy] = useState<string>("");

  const resolvedVaultPath = useMemo(() => {
    if (vaultPath) return vaultPath;
    return data?.defaultVaultPath || "obsidian-vault";
  }, [vaultPath, data?.defaultVaultPath]);

  async function revealToken() {
    setBusy("reveal");
    try {
      const res = await gatewayFetch("/api/sync/obsidian/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "revealToken" }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || "Failed to reveal token");
      setToken(body.token || "");
      if (body.token) toast.success("Token revealed");
    } catch (err: any) {
      toast.error(err?.message || "Failed to reveal token");
    } finally {
      setBusy("");
    }
  }

  async function generateToken() {
    setBusy("generate");
    try {
      const res = await gatewayFetch("/api/sync/obsidian/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "generateToken" }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || "Failed to generate token");
      setToken(body.token || "");
      toast.success("Generated new token");
      await refetch();
    } catch (err: any) {
      toast.error(err?.message || "Failed to generate token");
    } finally {
      setBusy("");
    }
  }

  async function saveVaultPath() {
    setBusy("vaultPath");
    try {
      const res = await gatewayFetch("/api/sync/obsidian/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "setVaultPath", vaultPath: resolvedVaultPath }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || "Failed to save vault path");
      setVaultPath(body.defaultVaultPath || resolvedVaultPath);
      toast.success("Saved default vault path");
      await refetch();
    } catch (err: any) {
      toast.error(err?.message || "Failed to save vault path");
    } finally {
      setBusy("");
    }
  }

  if (loading) return <div className="text-zinc-400">Loading...</div>;

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h2 className="text-xl font-semibold text-white mb-1">Obsidian Sync</h2>
        <p className="text-sm text-zinc-400">
          Download the Synapse plugin and copy the required connection settings.
        </p>
      </div>

      {error && (
        <Card className="bg-red-500/10 border-red-500/30">
          <CardContent className="pt-6 text-sm text-red-200">{error}</CardContent>
        </Card>
      )}

      <Card className="bg-white/[0.04] border-white/[0.06]">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-zinc-300">Connection Info</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-zinc-500 uppercase tracking-wide block mb-1">Synapse URL</label>
              <div className="flex gap-2">
                <Input readOnly value={data?.synapseBaseUrl || ""} className="bg-white/[0.06] border-white/[0.08] text-white" />
                <Button variant="outline" onClick={() => copyToClipboard(data?.synapseBaseUrl || "", "Synapse URL")}>Copy</Button>
              </div>
            </div>
            <div>
              <label className="text-xs text-zinc-500 uppercase tracking-wide block mb-1">Gateway ID</label>
              <div className="flex gap-2">
                <Input readOnly value={data?.gatewayId || ""} className="bg-white/[0.06] border-white/[0.08] text-white" />
                <Button variant="outline" onClick={() => copyToClipboard(data?.gatewayId || "", "Gateway ID")}>Copy</Button>
              </div>
            </div>
          </div>
          <div>
            <label className="text-xs text-zinc-500 uppercase tracking-wide block mb-1">Sync Endpoint</label>
            <div className="flex gap-2">
              <Input readOnly value={data?.syncEndpoint || ""} className="bg-white/[0.06] border-white/[0.08] text-white" />
              <Button variant="outline" onClick={() => copyToClipboard(data?.syncEndpoint || "", "Sync endpoint")}>Copy</Button>
            </div>
          </div>
          <div>
            <label className="text-xs text-zinc-500 uppercase tracking-wide block mb-1">LiveSync Proxy Endpoint</label>
            <div className="flex gap-2">
              <Input readOnly value={data?.liveSyncProxyEndpoint || ""} className="bg-white/[0.06] border-white/[0.08] text-white" />
              <Button variant="outline" onClick={() => copyToClipboard(data?.liveSyncProxyEndpoint || "", "LiveSync proxy endpoint")}>Copy</Button>
            </div>
          </div>
          <div>
            <label className="text-xs text-zinc-500 uppercase tracking-wide block mb-1">Plugin Folder</label>
            <Input readOnly value={data?.pluginInstallPath || ".obsidian/plugins/synapse-obsidian-sync"} className="bg-white/[0.06] border-white/[0.08] text-white" />
          </div>
          <div>
            <label className="text-xs text-zinc-500 uppercase tracking-wide block mb-1">Plugin ID</label>
            <Input readOnly value={data?.pluginId || "synapse-obsidian-sync"} className="bg-white/[0.06] border-white/[0.08] text-white" />
          </div>
        </CardContent>
      </Card>

      <Card className="bg-white/[0.04] border-white/[0.06]">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-zinc-300 flex items-center gap-2">
            <ShieldCheck className="h-4 w-4" /> Auth Token
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-zinc-400">
            Use this as the Bearer token in the Obsidian plugin.
          </p>
          <div className="flex gap-2">
            <Input
              readOnly
              value={token || data?.tokenPreview || (data?.tokenConfigured ? "configured" : "not configured")}
              className="bg-white/[0.06] border-white/[0.08] text-white"
            />
            <Button
              variant="outline"
              onClick={revealToken}
              disabled={busy === "reveal"}
            >
              Reveal
            </Button>
            <Button
              variant="outline"
              onClick={generateToken}
              disabled={busy === "generate"}
            >
              Generate
            </Button>
            <Button
              variant="outline"
              onClick={() => copyToClipboard(token, "Token")}
              disabled={!token}
            >
              Copy
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-white/[0.04] border-white/[0.06]">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-zinc-300">Default Vault Path</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Input
              value={resolvedVaultPath}
              onChange={(e) => setVaultPath(e.target.value)}
              placeholder="obsidian-vault"
              className="bg-white/[0.06] border-white/[0.08] text-white"
            />
            <Button onClick={saveVaultPath} disabled={busy === "vaultPath"}>
              Save
            </Button>
          </div>
          <p className="text-xs text-zinc-500">
            This is the default remote path used by `/sync/obsidian`.
          </p>
        </CardContent>
      </Card>

      <Card className="bg-white/[0.04] border-white/[0.06]">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-zinc-300">Plugin Download</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-zinc-400">
            Download these files into `.obsidian/plugins/synapse-obsidian-sync`.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => downloadPluginFile("manifest.json")}>
              <Download className="h-3.5 w-3.5 mr-1" /> manifest.json
            </Button>
            <Button variant="outline" onClick={() => downloadPluginFile("main.js")}>
              <Download className="h-3.5 w-3.5 mr-1" /> main.js
            </Button>
            <Button variant="outline" onClick={() => downloadPluginFile("versions.json")}>
              <Download className="h-3.5 w-3.5 mr-1" /> versions.json
            </Button>
            <Button variant="outline" onClick={() => downloadPluginFile("README.md")}>
              <Download className="h-3.5 w-3.5 mr-1" /> README.md
            </Button>
          </div>
          <Button variant="ghost" onClick={() => refetch()}>
            <RefreshCw className="h-3.5 w-3.5 mr-1" /> Refresh Info
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
