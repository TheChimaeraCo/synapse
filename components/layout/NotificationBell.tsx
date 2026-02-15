"use client";
import { gatewayFetch } from "@/lib/gatewayFetch";

import { useFetch } from "@/lib/hooks";
import { Bell } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";

interface Notification {
  _id: string;
  type: "info" | "warning" | "error" | "critical";
  title: string;
  message: string;
  read: boolean;
  createdAt: number;
  metadata?: { type?: string; telegramId?: string; displayName?: string; username?: string };
}

interface NotifData {
  unread: Notification[];
  recent: Notification[];
}

function typeColor(type: string) {
  switch (type) {
    case "critical": return "text-red-400";
    case "error": return "text-red-400";
    case "warning": return "text-yellow-400";
    default: return "text-blue-400";
  }
}

function timeSince(ts: number) {
  const diff = Date.now() - ts;
  if (diff < 60000) return "now";
  if (diff < 3600000) return `${Math.round(diff / 60000)}m`;
  if (diff < 86400000) return `${Math.round(diff / 3600000)}h`;
  return `${Math.round(diff / 86400000)}d`;
}

export function NotificationBell() {
  const { data, refetch } = useFetch<NotifData>("/api/notifications", 30000);
  const unreadCount = data?.unread?.length ?? 0;
  const recent = data?.recent ?? [];

  const clearAll = async () => {
    await gatewayFetch("/api/notifications", { method: "DELETE" });
    refetch();
  };

  const markAllRead = async () => {
    await gatewayFetch("/api/notifications", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ markAllRead: true }),
    });
    refetch();
  };

  const markRead = async (id: string) => {
    await gatewayFetch("/api/notifications", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    refetch();
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="relative p-2.5 rounded-xl hover:bg-white/[0.08] transition-all outline-none">
          <Bell className="h-4 w-4 text-zinc-400" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] text-white font-bold">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <div className="flex items-center justify-between px-3 py-2">
          <p className="text-sm font-medium">Notifications</p>
          <div className="flex gap-1">
            {unreadCount > 0 && (
              <Button variant="ghost" size="sm" className="text-xs h-6" onClick={markAllRead}>
                Mark read
              </Button>
            )}
            {recent.length > 0 && (
              <Button variant="ghost" size="sm" className="text-xs h-6 text-red-400 hover:text-red-300" onClick={clearAll}>
                Clear all
              </Button>
            )}
          </div>
        </div>
        <DropdownMenuSeparator />
        {recent.length === 0 ? (
          <div className="px-3 py-4 text-center text-sm text-zinc-500">
            No notifications
          </div>
        ) : (
          recent.slice(0, 8).map((n) => (
            <DropdownMenuItem
              key={n._id}
              className="flex flex-col items-start gap-0.5 px-3 py-2 cursor-pointer"
              onClick={(e) => {
                if (n.metadata?.type === "telegram_access_request") {
                  e.preventDefault();
                  e.stopPropagation();
                  return;
                }
                if (!n.read) markRead(n._id);
              }}
            >
              <div className="flex items-center gap-2 w-full">
                <span className={`text-xs font-medium ${typeColor(n.type)}`}>
                  {n.type.toUpperCase()}
                </span>
                <span className="text-xs text-zinc-500 ml-auto">{timeSince(n.createdAt)}</span>
                {!n.read && <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />}
              </div>
              <p className="text-sm">{n.title}</p>
              <p className="text-xs text-zinc-500 line-clamp-1">{n.message}</p>
              {n.metadata?.type === "telegram_access_request" && !n.read && (
                <div className="flex gap-2 mt-1.5 w-full" onClick={(e) => e.stopPropagation()}>
                  <button
                    className="flex-1 px-2 py-1 text-xs font-medium rounded bg-green-600 hover:bg-green-500 text-white transition-colors"
                    onClick={async (e) => {
                      e.stopPropagation();
                      await gatewayFetch("/api/telegram-auth", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ action: "approve", telegramId: n.metadata!.telegramId }),
                      });
                      markRead(n._id);
                      refetch();
                    }}
                  >
                    ✅ Approve
                  </button>
                  <button
                    className="flex-1 px-2 py-1 text-xs font-medium rounded bg-red-600 hover:bg-red-500 text-white transition-colors"
                    onClick={async (e) => {
                      e.stopPropagation();
                      await gatewayFetch("/api/telegram-auth", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ action: "block", telegramId: n.metadata!.telegramId }),
                      });
                      markRead(n._id);
                      refetch();
                    }}
                  >
                    ❌ Block
                  </button>
                </div>
              )}
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
