"use client";

import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Toggle } from "@/components/ui/toggle";
import { gatewayFetch } from "@/lib/gatewayFetch";
import { useFetch } from "@/lib/hooks";
import { useConfigSettings } from "@/lib/useConfigSettings";
import { toast } from "sonner";
import { Download, Key, Plus, RefreshCw, ShieldCheck, Trash2 } from "lucide-react";

interface ObsidianSetupResponse {
  gatewayId: string;
  gatewaySlug: string;
  gatewayName: string;
  synapseBaseUrl: string;
  syncEndpoint: string;
  yjsEndpoint?: string;
  liveSyncProxyEndpoint: string;
  defaultVaultPath: string;
  tokenConfigured: boolean;
  tokenPreview: string;
  pluginId: string;
  pluginInstallPath: string;
}

interface ObsidianVaultKey {
  id: string;
  name: string;
  prefix: string;
  createdAt: number;
  revokedAt?: number;
  lastUsedAt?: number;
}

interface ObsidianVault {
  id: string;
  name: string;
  path: string;
  createdAt: number;
  updatedAt: number;
  keys: ObsidianVaultKey[];
}

interface ObsidianVaultsResponse {
  vaults: ObsidianVault[];
}

interface ObsidianSyncLogEntry {
  _id: string;
  timestamp: number;
  action: string;
  ip?: string;
  details?: string;
  detailsJson?: {
    method?: string;
    authMode?: string;
    vaultPath?: string;
    stream?: boolean;
    filePath?: string;
    operations?: number;
    applied?: number;
    statusCode?: number;
    message?: string;
  } | null;
}

interface ObsidianSyncLogsResponse {
  logs: ObsidianSyncLogEntry[];
  count: number;
}

interface VaultBackupStatusResponse {
  enabled: boolean;
  vaultPath: string;
  lastRunAt: number | null;
  lastResult: {
    ok?: boolean;
    scanned?: number;
    backedUp?: number;
    skippedLarge?: number;
    failed?: number;
    runId?: string;
    error?: string;
    finishedAt?: number;
  } | string | null;
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

function downloadPluginZip() {
  const anchor = document.createElement("a");
  anchor.href = "/api/sync/obsidian/plugin?bundle=zip";
  anchor.download = "synapse-obsidian-sync.zip";
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
}

export function ObsidianTab() {
  const { data, loading, error, refetch } = useFetch<ObsidianSetupResponse>("/api/sync/obsidian/setup");
  const { get: getBackupCfg, set: setBackupCfg, save: saveBackupCfg, saving: savingBackupCfg } = useConfigSettings("sync.obsidian.");
  const {
    data: vaultsData,
    loading: vaultsLoading,
    error: vaultsError,
    refetch: refetchVaults,
  } = useFetch<ObsidianVaultsResponse>("/api/sync/obsidian/vaults");
  const {
    data: logsData,
    loading: logsLoading,
    error: logsError,
    refetch: refetchLogs,
  } = useFetch<ObsidianSyncLogsResponse>("/api/sync/obsidian/logs?limit=40");
  const {
    data: backupStatus,
    loading: backupStatusLoading,
    error: backupStatusError,
    refetch: refetchBackupStatus,
  } = useFetch<VaultBackupStatusResponse>("/api/vault/backup");

  const [legacyToken, setLegacyToken] = useState("");
  const [vaultPath, setVaultPath] = useState("");
  const [newVaultName, setNewVaultName] = useState("");
  const [newVaultPath, setNewVaultPath] = useState("");
  const [newKeyNameByVault, setNewKeyNameByVault] = useState<Record<string, string>>({});
  const [newKeyToken, setNewKeyToken] = useState<{
    vaultName: string;
    keyName: string;
    token: string;
    prefix: string;
  } | null>(null);
  const [busy, setBusy] = useState<string>("");

  const resolvedVaultPath = useMemo(() => {
    if (vaultPath) return vaultPath;
    return data?.defaultVaultPath || "obsidian-vault";
  }, [vaultPath, data?.defaultVaultPath]);

  async function revealLegacyToken() {
    setBusy("reveal");
    try {
      const res = await gatewayFetch("/api/sync/obsidian/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "revealToken" }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || "Failed to reveal token");
      setLegacyToken(body.token || "");
      if (body.token) toast.success("Legacy token revealed");
    } catch (err: any) {
      toast.error(err?.message || "Failed to reveal token");
    } finally {
      setBusy("");
    }
  }

  async function generateLegacyToken() {
    setBusy("generate");
    try {
      const res = await gatewayFetch("/api/sync/obsidian/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "generateToken" }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || "Failed to generate token");
      setLegacyToken(body.token || "");
      toast.success("Generated new legacy token");
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

  async function runFullBackup() {
    setBusy("backup");
    try {
      const res = await gatewayFetch("/api/vault/backup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ maxFiles: 1500 }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || "Failed to run backup");
      toast.success(`Backup complete: ${body?.backedUp ?? 0} file(s) uploaded`);
      await refetchBackupStatus();
    } catch (err: any) {
      toast.error(err?.message || "Failed to run backup");
    } finally {
      setBusy("");
    }
  }

  async function runVaultAction(
    action: string,
    payload: Record<string, unknown>,
    onSuccess?: (body: any) => void,
    successMessage?: string,
  ) {
    setBusy(action);
    try {
      const res = await gatewayFetch("/api/sync/obsidian/vaults", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...payload }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || `Failed to ${action}`);
      if (onSuccess) onSuccess(body);
      if (successMessage) toast.success(successMessage);
      await refetchVaults();
    } catch (err: any) {
      toast.error(err?.message || `Failed to ${action}`);
    } finally {
      setBusy("");
    }
  }

  async function createVault() {
    const nextName = (newVaultName || "").trim() || "Vault";
    const nextPath = (newVaultPath || "").trim() || "obsidian-vault";
    await runVaultAction(
      "createVault",
      { name: nextName, path: nextPath },
      () => {
        setNewVaultName("");
        setNewVaultPath("");
      },
      "Vault created",
    );
  }

  async function deleteVault(vault: ObsidianVault) {
    if (!window.confirm(`Delete vault \"${vault.name}\"? This only removes config and keys.`)) return;
    await runVaultAction("deleteVault", { vaultId: vault.id }, undefined, "Vault deleted");
  }

  async function createVaultKey(vault: ObsidianVault) {
    const keyName = (newKeyNameByVault[vault.id] || "").trim() || "Vault Key";
    await runVaultAction(
      "createKey",
      { vaultId: vault.id, keyName },
      (body) => {
        const token = body?.newKey?.token || "";
        if (token) {
          setNewKeyToken({
            vaultName: vault.name,
            keyName: body.newKey.name || keyName,
            token,
            prefix: body.newKey.prefix || "",
          });
          copyToClipboard(token, "Vault key token");
        }
        setNewKeyNameByVault((prev) => ({ ...prev, [vault.id]: "" }));
      },
      "Vault key created",
    );
  }

  async function revokeVaultKey(vault: ObsidianVault, key: ObsidianVaultKey) {
    if (!window.confirm(`Revoke key \"${key.name}\" for vault \"${vault.name}\"?`)) return;
    await runVaultAction("revokeKey", { vaultId: vault.id, keyId: key.id }, undefined, "Vault key revoked");
  }

  if (loading) return <div className="text-zinc-400">Loading...</div>;

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h2 className="text-xl font-semibold text-white mb-1">Obsidian Sync</h2>
        <p className="text-sm text-zinc-400">
          Manage multiple vaults, generate scoped keys, and download the Synapse plugin.
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
            <label className="text-xs text-zinc-500 uppercase tracking-wide block mb-1">Yjs Endpoint</label>
            <div className="flex gap-2">
              <Input readOnly value={data?.yjsEndpoint || ""} className="bg-white/[0.06] border-white/[0.08] text-white" />
              <Button variant="outline" onClick={() => copyToClipboard(data?.yjsEndpoint || "", "Yjs endpoint")}>Copy</Button>
            </div>
          </div>
          <div>
            <label className="text-xs text-zinc-500 uppercase tracking-wide block mb-1">Plugin Folder</label>
            <Input readOnly value={data?.pluginInstallPath || ".obsidian/plugins/synapse-obsidian-sync"} className="bg-white/[0.06] border-white/[0.08] text-white" />
          </div>
        </CardContent>
      </Card>

      <Card className="bg-white/[0.04] border-white/[0.06]">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-zinc-300">Vaults & Keys</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-xs text-zinc-400">
            Create one key per vault (recommended). Keys are scoped to that vault path.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_auto] gap-2">
            <Input
              value={newVaultName}
              onChange={(e) => setNewVaultName(e.target.value)}
              placeholder="Vault name"
              className="bg-white/[0.06] border-white/[0.08] text-white"
            />
            <Input
              value={newVaultPath}
              onChange={(e) => setNewVaultPath(e.target.value)}
              placeholder="vault path (e.g. obsidian/cars)"
              className="bg-white/[0.06] border-white/[0.08] text-white"
            />
            <Button onClick={createVault} disabled={busy === "createVault"}>
              <Plus className="h-3.5 w-3.5 mr-1" /> Create Vault
            </Button>
          </div>

          {newKeyToken && (
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-100">
              <div className="font-medium text-emerald-200">New key generated</div>
              <div className="mt-1">Vault: {newKeyToken.vaultName} | Key: {newKeyToken.keyName}</div>
              <div className="mt-1 break-all font-mono text-[11px]">{newKeyToken.token}</div>
              <div className="mt-2 flex gap-2">
                <Button size="sm" variant="outline" onClick={() => copyToClipboard(newKeyToken.token, "Vault key token")}>
                  Copy Token
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setNewKeyToken(null)}>
                  Hide
                </Button>
              </div>
            </div>
          )}

          {vaultsError && (
            <div className="text-xs text-red-300 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
              {vaultsError}
            </div>
          )}

          {vaultsLoading && !vaultsData && (
            <div className="text-sm text-zinc-400">Loading vaults...</div>
          )}

          {!vaultsLoading && !vaultsError && (vaultsData?.vaults?.length || 0) === 0 && (
            <div className="text-sm text-zinc-400">No vaults configured yet.</div>
          )}

          {!!vaultsData?.vaults?.length && (
            <div className="space-y-3">
              {vaultsData.vaults.map((vault) => (
                <div key={vault.id} className="rounded-lg border border-white/[0.08] bg-white/[0.03] p-3 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="text-sm text-zinc-200 font-medium">{vault.name}</div>
                      <div className="text-xs text-zinc-500 font-mono">{vault.path}</div>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => copyToClipboard(vault.path, "Vault path")}>Copy Path</Button>
                      <Button size="sm" variant="destructive" onClick={() => deleteVault(vault)} disabled={busy === "deleteVault"}>
                        <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete
                      </Button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-2">
                    <Input
                      value={newKeyNameByVault[vault.id] || ""}
                      onChange={(e) =>
                        setNewKeyNameByVault((prev) => ({
                          ...prev,
                          [vault.id]: e.target.value,
                        }))
                      }
                      placeholder="new key name"
                      className="bg-white/[0.06] border-white/[0.08] text-white"
                    />
                    <Button onClick={() => createVaultKey(vault)} disabled={busy === "createKey"}>
                      <Key className="h-3.5 w-3.5 mr-1" /> Create Key
                    </Button>
                  </div>

                  {vault.keys.length === 0 ? (
                    <div className="text-xs text-zinc-500">No keys yet.</div>
                  ) : (
                    <div className="space-y-2">
                      {vault.keys.map((key) => (
                        <div key={key.id} className="rounded border border-white/[0.08] bg-black/20 px-2.5 py-2 text-xs">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div>
                              <span className="text-zinc-200 font-medium">{key.name}</span>
                              <span className="text-zinc-500"> | {key.prefix}</span>
                            </div>
                            {!key.revokedAt && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => revokeVaultKey(vault, key)}
                                disabled={busy === "revokeKey"}
                              >
                                Revoke
                              </Button>
                            )}
                          </div>
                          <div className="mt-1 text-zinc-500">
                            created {new Date(key.createdAt).toLocaleString()}
                            {key.lastUsedAt ? ` | last used ${new Date(key.lastUsedAt).toLocaleString()}` : " | never used"}
                            {key.revokedAt ? ` | revoked ${new Date(key.revokedAt).toLocaleString()}` : ""}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="text-[11px] text-zinc-500">
                    Plugin values: gatewayId={data?.gatewayId || ""}, vaultPath={vault.path}, Bearer=&lt;vault key token&gt;
                  </div>
                </div>
              ))}
            </div>
          )}

          <Button variant="ghost" onClick={() => refetchVaults()}>
            <RefreshCw className="h-3.5 w-3.5 mr-1" /> Refresh Vaults
          </Button>
        </CardContent>
      </Card>

      <Card className="bg-white/[0.04] border-white/[0.06]">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-zinc-300">Plugin Download</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-zinc-400">
            Download as ZIP and extract into `.obsidian/plugins/synapse-obsidian-sync`.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button onClick={downloadPluginZip}>
              <Download className="h-3.5 w-3.5 mr-1" /> Download Plugin ZIP
            </Button>
            <Button variant="outline" onClick={() => downloadPluginFile("manifest.json")}>
              manifest.json
            </Button>
            <Button variant="outline" onClick={() => downloadPluginFile("main.js")}>
              main.js
            </Button>
            <Button variant="outline" onClick={() => downloadPluginFile("versions.json")}>
              versions.json
            </Button>
            <Button variant="outline" onClick={() => downloadPluginFile("README.md")}>
              README.md
            </Button>
          </div>
          <Button variant="ghost" onClick={() => refetch()}>
            <RefreshCw className="h-3.5 w-3.5 mr-1" /> Refresh Info
          </Button>
        </CardContent>
      </Card>

      <Card className="bg-white/[0.04] border-white/[0.06]">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-zinc-300 flex items-center gap-2">
            <ShieldCheck className="h-4 w-4" /> Legacy Gateway Token (Fallback)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-zinc-400">
            Keep this only if you still use one token for all vaults. Prefer vault-specific keys above.
          </p>
          <div className="flex gap-2">
            <Input
              readOnly
              value={legacyToken || data?.tokenPreview || (data?.tokenConfigured ? "configured" : "not configured")}
              className="bg-white/[0.06] border-white/[0.08] text-white"
            />
            <Button variant="outline" onClick={revealLegacyToken} disabled={busy === "reveal"}>
              Reveal
            </Button>
            <Button variant="outline" onClick={generateLegacyToken} disabled={busy === "generate"}>
              Generate
            </Button>
            <Button variant="outline" onClick={() => copyToClipboard(legacyToken, "Legacy token")} disabled={!legacyToken}>
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
            Used as fallback when no vaultPath is specified.
          </p>
        </CardContent>
      </Card>

      <Card className="bg-white/[0.04] border-white/[0.06]">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-zinc-300">Convex Vault Backup</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Toggle
            checked={getBackupCfg("convex_backup_enabled", backupStatus?.enabled ? "true" : "false") === "true"}
            onChange={(v) => setBackupCfg("convex_backup_enabled", v ? "true" : "false")}
            label="Auto-backup vault file changes to Convex storage during sync"
          />

          <div className="flex flex-wrap gap-2">
            <Button onClick={saveBackupCfg} disabled={savingBackupCfg} variant="outline">
              {savingBackupCfg ? "Saving..." : "Save Backup Setting"}
            </Button>
            <Button onClick={runFullBackup} disabled={busy === "backup"}>
              {busy === "backup" ? "Backing Up..." : "Run Full Backup Now"}
            </Button>
            <Button variant="ghost" onClick={() => refetchBackupStatus()}>
              <RefreshCw className="h-3.5 w-3.5 mr-1" /> Refresh Backup Status
            </Button>
          </div>

          {backupStatusError && (
            <div className="text-xs text-red-300 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
              {backupStatusError}
            </div>
          )}

          {backupStatusLoading && !backupStatus && (
            <div className="text-sm text-zinc-400">Loading backup status...</div>
          )}

          {backupStatus && (
            <div className="text-xs text-zinc-400 space-y-1 bg-white/[0.03] border border-white/[0.08] rounded-lg px-3 py-2">
              <div>Auto backup: <span className="text-zinc-200">{backupStatus.enabled ? "enabled" : "disabled"}</span></div>
              <div>Vault path: <span className="text-zinc-200">{backupStatus.vaultPath || "obsidian-vault"}</span></div>
              <div>
                Last run:{" "}
                <span className="text-zinc-200">
                  {backupStatus.lastRunAt ? new Date(backupStatus.lastRunAt).toLocaleString() : "never"}
                </span>
              </div>
              {backupStatus.lastResult && typeof backupStatus.lastResult === "object" && (
                <div className="pt-1 border-t border-white/[0.08]">
                  result: scanned {backupStatus.lastResult.scanned ?? 0}, backed up {backupStatus.lastResult.backedUp ?? 0}, failed {backupStatus.lastResult.failed ?? 0}
                </div>
              )}
              {backupStatus.lastResult && typeof backupStatus.lastResult === "string" && (
                <div className="pt-1 border-t border-white/[0.08] break-all">{backupStatus.lastResult}</div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="bg-white/[0.04] border-white/[0.06]">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-zinc-300">Sync Logs</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs text-zinc-400">
              Recent Obsidian sync requests and failures from this gateway.
            </p>
            <Button variant="outline" size="sm" onClick={() => refetchLogs()}>
              <RefreshCw className="h-3.5 w-3.5 mr-1" /> Refresh Logs
            </Button>
          </div>

          {logsError && (
            <div className="text-xs text-red-300 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
              {logsError}
            </div>
          )}

          {logsLoading && !logsData && (
            <div className="text-sm text-zinc-400">Loading logs...</div>
          )}

          {!logsLoading && !logsError && (logsData?.logs?.length || 0) === 0 && (
            <div className="text-sm text-zinc-400">No sync logs yet.</div>
          )}

          {!!logsData?.logs?.length && (
            <div className="space-y-2 max-h-80 overflow-auto pr-1">
              {logsData.logs.map((entry) => {
                const isError = entry.action.endsWith(".error");
                const details = entry.detailsJson;
                return (
                  <div
                    key={entry._id}
                    className={`rounded-lg border px-3 py-2 ${
                      isError
                        ? "border-red-500/30 bg-red-500/10"
                        : "border-white/[0.08] bg-white/[0.03]"
                    }`}
                  >
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className={isError ? "text-red-300 font-medium" : "text-emerald-300 font-medium"}>
                        {isError ? "ERROR" : "OK"}
                      </span>
                      <span className="text-zinc-500">|</span>
                      <span className="text-zinc-300">{details?.method || "?"}</span>
                      <span className="text-zinc-500">|</span>
                      <span className="text-zinc-400">{new Date(entry.timestamp).toLocaleString()}</span>
                      {typeof details?.statusCode === "number" && (
                        <>
                          <span className="text-zinc-500">|</span>
                          <span className="text-zinc-400">HTTP {details.statusCode}</span>
                        </>
                      )}
                    </div>
                    <div className="mt-1 text-xs text-zinc-300 break-all">
                      {details?.message || "No message"}
                    </div>
                    <div className="mt-1 text-[11px] text-zinc-500">
                      vault: {details?.vaultPath || "-"} | ops: {typeof details?.operations === "number" ? details.operations : "-"} | applied: {typeof details?.applied === "number" ? details.applied : "-"}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
