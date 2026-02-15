"use client";
import { gatewayFetch } from "@/lib/gatewayFetch";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useFetch } from "@/lib/hooks";
import { MessageSquare, Send, Plus, Settings2, ChevronDown, ChevronRight, ToggleLeft, ToggleRight } from "lucide-react";

interface Channel {
  _id: string;
  platform: string;
  name: string;
  isActive: boolean;
  enabled?: boolean;
  config: any;
  responseFormat?: string;
  maxMessageLength?: number;
  streamingEnabled?: boolean;
  typingIndicator?: boolean;
  lastActivityAt?: number;
}

export function ChannelsTab() {
  const { data: configData, refetch: refetchConfig } = useFetch<Record<string, string>>("/api/config/all");
  const { data: channels, refetch: refetchChannels } = useFetch<Channel[]>("/api/channels");

  const telegramToken = configData?.telegram_bot_token || "";
  const telegramConnected = !!telegramToken;

  const [editingTelegram, setEditingTelegram] = useState(false);
  const [botToken, setBotToken] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [botUsername, setBotUsername] = useState<string | null>(null);
  const [tokenValid, setTokenValid] = useState<boolean | null>(null);
  const [expandedChannel, setExpandedChannel] = useState<string | null>(null);

  const telegramChannel = channels?.find((c) => c.platform === "telegram");
  const hubChannel = channels?.find((c) => c.platform === "hub");

  const handleTestTelegram = async () => {
    if (!botToken) return;
    setTesting(true);
    setTokenValid(null);
    try {
      const res = await gatewayFetch("/api/config/test-telegram", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ botToken }),
      });
      const result = await res.json();
      setTokenValid(result.valid);
      if (result.valid && result.botUsername) setBotUsername(result.botUsername);
      else toast.error(result.error || "Invalid token");
    } catch {
      setTokenValid(false);
      toast.error("Failed to test");
    } finally {
      setTesting(false);
    }
  };

  const handleSaveTelegram = async () => {
    setSaving(true);
    try {
      await gatewayFetch("/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "telegram_bot_token", value: botToken }),
      });
      const secret = Array.from(crypto.getRandomValues(new Uint8Array(16)))
        .map((b) => b.toString(16).padStart(2, "0")).join("");
      await gatewayFetch("/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "telegram_webhook_secret", value: secret }),
      });
      try {
        await gatewayFetch("/api/config/register-webhook", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ botToken, secret }),
        });
      } catch { /* optional */ }
      toast.success("Telegram updated");
      setEditingTelegram(false);
      refetchConfig();
    } catch {
      toast.error("Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const handleReregisterWebhook = async () => {
    setSaving(true);
    try {
      const res = await gatewayFetch("/api/config/register-webhook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (res.ok) toast.success("Webhook re-registered");
      else toast.error("Failed to register webhook");
    } catch {
      toast.error("Failed to register webhook");
    } finally {
      setSaving(false);
    }
  };

  const handleToggleChannel = async (channelId: string, currentEnabled: boolean) => {
    try {
      await gatewayFetch(`/api/channels/${channelId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !currentEnabled }),
      });
      toast.success(`Channel ${!currentEnabled ? "enabled" : "disabled"}`);
      refetchChannels();
    } catch {
      toast.error("Failed to update channel");
    }
  };

  const handleUpdateChannelSetting = async (channelId: string, key: string, value: any) => {
    try {
      await gatewayFetch(`/api/channels/${channelId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [key]: value }),
      });
      toast.success("Setting updated");
      refetchChannels();
    } catch {
      toast.error("Failed to update");
    }
  };

  const isEnabled = (ch: Channel) => ch.enabled !== false;

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h2 className="text-xl font-semibold text-white mb-1">Channels</h2>
        <p className="text-sm text-zinc-400">Manage connected messaging channels.</p>
      </div>

      {/* Hub Chat */}
      <Card className="bg-white/[0.04] border-white/[0.06]">
        <CardContent className="py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-blue-900/50 flex items-center justify-center">
                <MessageSquare className="w-5 h-5 text-blue-400" />
              </div>
              <div>
                <p className="text-white font-medium">Hub Chat</p>
                <p className="text-zinc-500 text-sm">Built-in web chat interface</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge className="bg-green-900 text-green-300">Always On</Badge>
              {hubChannel && (
                <button
                  onClick={() => setExpandedChannel(expandedChannel === hubChannel._id ? null : hubChannel._id)}
                  className="text-zinc-400 hover:text-white p-1"
                >
                  {expandedChannel === hubChannel?._id ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                </button>
              )}
            </div>
          </div>
          {hubChannel && expandedChannel === hubChannel._id && (
            <div className="mt-4 pt-4 border-t border-white/[0.06] space-y-3">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-zinc-400">Response Format</span>
                  <p className="text-white">{hubChannel.responseFormat || "markdown"}</p>
                </div>
                <div>
                  <span className="text-zinc-400">Streaming</span>
                  <p className="text-white">{hubChannel.streamingEnabled !== false ? "Enabled" : "Disabled"}</p>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Telegram */}
      <Card className="bg-white/[0.04] border-white/[0.06]">
        <CardContent className="py-4 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-sky-900/50 flex items-center justify-center">
                <Send className="w-5 h-5 text-sky-400" />
              </div>
              <div>
                <p className="text-white font-medium">Telegram</p>
                <p className="text-zinc-500 text-sm">
                  {telegramConnected ? "Connected" : "Not configured"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {telegramChannel && (
                <button
                  onClick={() => handleToggleChannel(telegramChannel._id, isEnabled(telegramChannel))}
                  className="text-zinc-400 hover:text-white"
                  title={isEnabled(telegramChannel) ? "Disable" : "Enable"}
                >
                  {isEnabled(telegramChannel) ? (
                    <ToggleRight className="w-6 h-6 text-green-400" />
                  ) : (
                    <ToggleLeft className="w-6 h-6 text-zinc-500" />
                  )}
                </button>
              )}
              <Badge className={telegramConnected ? "bg-green-900 text-green-300" : "bg-white/[0.06] text-zinc-400"}>
                {telegramConnected ? "Connected" : "Disconnected"}
              </Badge>
              {telegramChannel && (
                <button
                  onClick={() => setExpandedChannel(expandedChannel === telegramChannel._id ? null : telegramChannel._id)}
                  className="text-zinc-400 hover:text-white p-1"
                >
                  {expandedChannel === telegramChannel._id ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                </button>
              )}
            </div>
          </div>

          {/* Expanded settings */}
          {telegramChannel && expandedChannel === telegramChannel._id && (
            <div className="mt-2 pt-4 border-t border-white/[0.06] space-y-3">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-zinc-400">Bot Username</span>
                  <p className="text-white">{telegramChannel.config?.botUsername || "Unknown"}</p>
                </div>
                <div>
                  <span className="text-zinc-400">Max Message Length</span>
                  <p className="text-white">{telegramChannel.maxMessageLength || 4096}</p>
                </div>
                <div>
                  <span className="text-zinc-400">Typing Indicator</span>
                  <button
                    onClick={() => handleUpdateChannelSetting(
                      telegramChannel._id,
                      "typingIndicator",
                      telegramChannel.typingIndicator === false
                    )}
                    className="block text-white hover:text-blue-400"
                  >
                    {telegramChannel.typingIndicator !== false ? "Enabled" : "Disabled"}
                  </button>
                </div>
                <div>
                  <span className="text-zinc-400">Response Format</span>
                  <p className="text-white">{telegramChannel.responseFormat || "markdown"}</p>
                </div>
              </div>
            </div>
          )}

          {telegramConnected && !editingTelegram && expandedChannel !== telegramChannel?._id && (
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => { setEditingTelegram(true); setBotToken(""); setTokenValid(null); }} className="border-white/[0.08] text-zinc-300">
                Edit Token
              </Button>
              <Button variant="outline" size="sm" onClick={handleReregisterWebhook} disabled={saving} className="border-white/[0.08] text-zinc-300">
                Re-register Webhook
              </Button>
            </div>
          )}

          {(editingTelegram || !telegramConnected) && (
            <div className="space-y-3 pt-2 border-t border-white/[0.06]">
              <div>
                <label className="text-sm text-zinc-400 mb-1 block">Bot Token</label>
                <div className="relative">
                  <Input
                    type={showToken ? "text" : "password"}
                    value={botToken}
                    onChange={(e) => { setBotToken(e.target.value); setTokenValid(null); setBotUsername(null); }}
                    placeholder="123456:ABC-DEF..."
                    className="bg-white/[0.06] border-white/[0.08] text-white pr-16"
                  />
                  <button type="button" onClick={() => setShowToken(!showToken)} className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-zinc-400 hover:text-white">
                    {showToken ? "Hide" : "Show"}
                  </button>
                </div>
              </div>
              <div className="flex gap-2 items-center">
                <Button variant="outline" size="sm" onClick={handleTestTelegram} disabled={testing || !botToken} className="border-white/[0.08] text-zinc-300">
                  {testing ? "Testing..." : "Test"}
                </Button>
                {tokenValid === true && botUsername && <Badge className="bg-green-900 text-green-300">@{botUsername}</Badge>}
                {tokenValid === false && <Badge className="bg-red-900 text-red-300">Invalid</Badge>}
              </div>
              <div className="flex gap-2">
                {editingTelegram && (
                  <Button variant="outline" size="sm" onClick={() => setEditingTelegram(false)} className="border-white/[0.08] text-zinc-300">Cancel</Button>
                )}
                <Button size="sm" onClick={handleSaveTelegram} disabled={saving || !botToken || !tokenValid}>
                  {saving ? "Saving..." : "Save"}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Future channels */}
      <Card className="bg-white/[0.04]/50 border-white/[0.06] border-dashed">
        <CardContent className="flex items-center justify-center py-8">
          <div className="text-center">
            <Plus className="w-8 h-8 text-zinc-600 mx-auto mb-2" />
            <p className="text-zinc-500 text-sm">Discord, Slack, and more coming soon</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
