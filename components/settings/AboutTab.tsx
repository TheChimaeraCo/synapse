"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useFetch } from "@/lib/hooks";
import { ExternalLink, Loader2, Database } from "lucide-react";
import { toast } from "sonner";

export function AboutTab() {
  const { data: configData } = useFetch<Record<string, string>>("/api/config/all");
  const [migrating, setMigrating] = useState(false);
  const [migrationResult, setMigrationResult] = useState<any>(null);

  const handleMigrate = async () => {
    if (!confirm("Run multi-gateway migration? This copies systemConfig to gatewayConfig and creates gateway memberships. It's safe to run multiple times (idempotent).")) return;
    setMigrating(true);
    try {
      const res = await gatewayFetch("/api/admin/migrate", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Migration failed");
        return;
      }
      setMigrationResult(data.results);
      toast.success("Migration complete!");
    } catch (err: any) {
      toast.error(err.message || "Migration failed");
    } finally {
      setMigrating(false);
    }
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h2 className="text-xl font-semibold text-zinc-200 mb-1">About</h2>
        <p className="text-sm text-zinc-400">System information and tools.</p>
      </div>

      <Card className="bg-white/[0.07] backdrop-blur-xl border border-white/10 rounded-xl">
        <CardHeader>
          <CardTitle className="text-sm text-zinc-300">System Info</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-zinc-400 text-sm">Synapse Version</span>
            <span className="text-zinc-200 text-sm font-mono">1.0.0</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-zinc-400 text-sm">Convex</span>
            <Badge className="bg-green-900 text-green-300">Connected</Badge>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-zinc-400 text-sm">AI Provider</span>
            <span className="text-zinc-200 text-sm">{configData?.ai_provider || "Not configured"}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-zinc-400 text-sm">Telegram</span>
            <Badge className={configData?.telegram_bot_token ? "bg-green-900 text-green-300" : "bg-white/[0.07] text-zinc-400"}>
              {configData?.telegram_bot_token ? "Connected" : "Not configured"}
            </Badge>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-white/[0.07] backdrop-blur-xl border border-white/10 rounded-xl">
        <CardHeader>
          <CardTitle className="text-sm text-zinc-300 flex items-center gap-2">
            <Database className="h-4 w-4" /> Migration Tools
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-zinc-400 text-sm">
            Migrate existing data to the multi-gateway architecture. Safe to run multiple times.
          </p>
          <Button onClick={handleMigrate} disabled={migrating}
            >
            {migrating ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Running...</> : "Run Migration"}
          </Button>
          {migrationResult && (
            <div className="bg-white/[0.04] border border-white/10 rounded-xl p-3 text-sm space-y-1">
              <div className="text-zinc-300">Configs copied: <span className="text-blue-400 font-mono">{migrationResult.configsCopied}</span></div>
              <div className="text-zinc-300">Members created: <span className="text-blue-400 font-mono">{migrationResult.membersCreated}</span></div>
              <div className="text-zinc-300">Master set: <span className="text-blue-400 font-mono">{migrationResult.masterSet ? "Yes" : "No (already set)"}</span></div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="bg-white/[0.07] backdrop-blur-xl border border-white/10 rounded-xl">
        <CardHeader>
          <CardTitle className="text-sm text-zinc-300">Links</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {[
            { label: "Documentation", href: "#" },
            { label: "GitHub", href: "#" },
            { label: "Discord Community", href: "#" },
          ].map((link) => (
            <a key={link.label} href={link.href} target="_blank" rel="noopener noreferrer"
              className="flex items-center justify-between p-2 rounded-xl hover:bg-white/10 transition-colors">
              <span className="text-zinc-300 text-sm">{link.label}</span>
              <ExternalLink className="w-4 h-4 text-zinc-500" />
            </a>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
