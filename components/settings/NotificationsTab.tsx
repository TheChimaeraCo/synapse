"use client";
import { gatewayFetch } from "@/lib/gatewayFetch";

import { useState, useEffect } from "react";
import { Bell, BellOff, Send, CheckCircle, XCircle } from "lucide-react";
import { subscribeToPush, unsubscribeFromPush, isSubscribed, getSubscriptionStatus } from "@/lib/pushNotifications";

export function NotificationsTab() {
  const [subscribed, setSubscribed] = useState(false);
  const [permission, setPermission] = useState<string>("default");
  const [loading, setLoading] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);

  useEffect(() => {
    checkStatus();
  }, []);

  async function checkStatus() {
    const status = await getSubscriptionStatus();
    setPermission(status);
    if (status === "granted") {
      const sub = await isSubscribed();
      setSubscribed(sub);
    }
  }

  async function handleToggle() {
    setLoading(true);
    try {
      if (subscribed) {
        await unsubscribeFromPush();
        setSubscribed(false);
      } else {
        const sub = await subscribeToPush();
        setSubscribed(!!sub);
        if (sub) setPermission("granted");
      }
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  }

  async function handleTest() {
    setTestResult(null);
    try {
      const res = await gatewayFetch("/api/push/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Synapse", body: "Test notification - push is working!", url: "/settings" }),
      });
      const data = await res.json();
      setTestResult(`Sent: ${data.sent}, Failed: ${data.failed}`);
    } catch (e) {
      setTestResult("Failed to send test");
    }
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h2 className="text-lg font-semibold text-zinc-200">Push Notifications</h2>
        <p className="text-sm text-zinc-400 mt-1">
          Receive push notifications when new messages arrive or alerts are triggered.
        </p>
      </div>

      {/* Status */}
      <div className="bg-white/[0.04] border border-white/10 rounded-xl p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {subscribed ? (
              <Bell className="w-5 h-5 text-blue-400" />
            ) : (
              <BellOff className="w-5 h-5 text-zinc-500" />
            )}
            <div>
              <p className="text-sm font-medium text-zinc-200">
                {subscribed ? "Notifications enabled" : "Notifications disabled"}
              </p>
              <p className="text-xs text-zinc-500">
                Permission: {permission}
              </p>
            </div>
          </div>
          <button
            onClick={handleToggle}
            disabled={loading || permission === "denied" || permission === "unsupported"}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              subscribed
                ? "bg-white/[0.07] text-zinc-300 hover:bg-white/10"
                : "bg-gradient-to-r from-blue-500/15 to-purple-500/10 text-blue-400 border border-white/10 hover:bg-white/10"
            } disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            {loading ? "..." : subscribed ? "Disable" : "Enable"}
          </button>
        </div>

        {permission === "denied" && (
          <p className="text-xs text-red-400">
            Notifications are blocked. Please enable them in your browser settings.
          </p>
        )}
        {permission === "unsupported" && (
          <p className="text-xs text-zinc-500">
            Push notifications are not supported in this browser.
          </p>
        )}
      </div>

      {/* Test */}
      {subscribed && (
        <div className="bg-white/[0.04] border border-white/10 rounded-xl p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-zinc-200">Test Notification</p>
              <p className="text-xs text-zinc-500">Send a test push to verify it works</p>
            </div>
            <button
              onClick={handleTest}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-white/[0.07] text-zinc-300 hover:bg-white/10 transition-all"
            >
              <Send className="w-4 h-4" />
              Test
            </button>
          </div>
          {testResult && (
            <p className="mt-3 text-xs text-zinc-400 flex items-center gap-1">
              {testResult.includes("Failed") ? (
                <XCircle className="w-3 h-3 text-red-400" />
              ) : (
                <CheckCircle className="w-3 h-3 text-green-400" />
              )}
              {testResult}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
