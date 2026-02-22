"use client";
import { gatewayFetch } from "@/lib/gatewayFetch";

import { useEffect, useState, useCallback, useRef } from "react";
import { useSession } from "next-auth/react";
import { AppShell } from "@/components/layout/AppShell";
import { ChatWindow } from "@/components/chat/ChatWindow";
import { ChatInput } from "@/components/chat/ChatInput";
import { LiveAgentsPanel } from "@/components/chat/LiveAgentsPanel";
import { ConversationsSidebar } from "@/components/chat/ConversationsSidebar";
import { ChannelHeader } from "@/components/chat/ChannelHeader";
import { AskInPopup } from "@/components/chat/AskInPopup";
import { Button } from "@/components/ui/button";
import { MessageSquare, Loader2, LayoutDashboard, Menu, Plus, X, History } from "lucide-react";
import { ChatSkeleton } from "@/components/ui/Skeletons";
import { EmptyChatIllustration } from "@/components/ui/EmptyStates";
import Link from "next/link";
import type { ChannelDisplay } from "@/lib/types";

export default function ChatPage() {
  const { data: session } = useSession();
  const gatewayId = (session?.user as any)?.gatewayId;

  const [channels, setChannels] = useState<ChannelDisplay[]>([]);
  const [activeChannelId, setActiveChannelId] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [scrollToSeq, setScrollToSeq] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [convoSidebarOpen, setConvoSidebarOpen] = useState(false);
  const [askInPopup, setAskInPopup] = useState<{ text: string; x: number; y: number } | null>(null);
  const [showCreateChannel, setShowCreateChannel] = useState(false);
  const [newChannelName, setNewChannelName] = useState("");

  // Load channels
  useEffect(() => {
    if (!gatewayId) return;
    let cancelled = false;

    (async () => {
      try {
        const res = await gatewayFetch("/api/channels");
        if (res.ok && !cancelled) {
          const data = await res.json();
          setChannels(data);
          // Default to hub channel, or first channel
          if (data.length > 0 && !activeChannelId) {
            const hub = data.find((c: any) => c.platform === "hub");
            const defaultId = hub?._id || data[0]._id;
            setActiveChannelId(defaultId);
            // Notify sidebar of active channel
            window.dispatchEvent(new CustomEvent("synapse:active-channel", { detail: { channelId: defaultId } }));
          }
        }
      } catch {}
      finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [gatewayId]);

  // Listen for channel selection from sidebar
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.channelId) {
        setActiveChannelId(detail.channelId);
        setSessionId(null);
      }
    };
    const createHandler = () => setShowCreateChannel(true);
    window.addEventListener("synapse:select-channel", handler);
    window.addEventListener("synapse:create-channel", createHandler);
    return () => {
      window.removeEventListener("synapse:select-channel", handler);
      window.removeEventListener("synapse:create-channel", createHandler);
    };
  }, []);

  // Broadcast active channel to sidebar when it changes
  useEffect(() => {
    if (activeChannelId) {
      window.dispatchEvent(new CustomEvent("synapse:active-channel", { detail: { channelId: activeChannelId } }));
    }
  }, [activeChannelId]);

  // When active channel changes, find/create session for it
  useEffect(() => {
    if (!gatewayId || !activeChannelId) return;
    let cancelled = false;

    (async () => {
      try {
        const res = await gatewayFetch(`/api/sessions?channelId=${activeChannelId}&limit=1`);
        if (res.ok && !cancelled) {
          const data = await res.json();
          const sessions = Array.isArray(data) ? data : data.sessions || [];
          if (sessions.length > 0) {
            setSessionId(sessions[0]._id);
          } else {
            const createRes = await gatewayFetch("/api/sessions", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ channelId: activeChannelId }),
            });
            if (createRes.ok && !cancelled) {
              const newSession = await createRes.json();
              setSessionId(newSession._id);
            }
          }
        }
      } catch (err) {
        console.error("Failed to load session for channel:", err);
      }
    })();

    return () => { cancelled = true; };
  }, [gatewayId, activeChannelId]);

  // Persist active session for global chat popout continuity.
  useEffect(() => {
    if (!sessionId || typeof window === "undefined") return;
    localStorage.setItem("synapse-popout-session-id", sessionId);
    window.dispatchEvent(new CustomEvent("synapse:active-session", { detail: { sessionId } }));
  }, [sessionId]);

  const handleSelectConversation = useCallback((id: string, startSeq?: number) => {
    if (startSeq) setScrollToSeq(startSeq);
  }, []);

  const handleCreateChannel = useCallback(async () => {
    if (!newChannelName.trim()) return;
    try {
      const res = await gatewayFetch("/api/channels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newChannelName.trim() }),
      });
      if (res.ok) {
        const { _id } = await res.json();
        const chRes = await gatewayFetch("/api/channels");
        if (chRes.ok) {
          const data = await chRes.json();
          setChannels(data);
        }
        setActiveChannelId(_id);
        setNewChannelName("");
        setShowCreateChannel(false);
      }
    } catch {}
  }, [newChannelName]);

  const activeChannel = channels.find((c) => c._id === activeChannelId) || null;
  const isPlatformChannel = activeChannel?.platform !== "hub" && activeChannel?.platform !== "custom" && activeChannel?.platform !== "api";
  const webChannels = channels.filter((c) => c.platform === "hub" || c.platform === "custom" || c.platform === "api");

  // Text selection handler for "Ask in..." on platform channels
  const handleMouseUp = useCallback(() => {
    if (!isPlatformChannel) return;
    const sel = window.getSelection();
    const text = sel?.toString().trim();
    if (!text || text.length < 5) {
      setAskInPopup(null);
      return;
    }
    const range = sel?.getRangeAt(0);
    if (range) {
      const rect = range.getBoundingClientRect();
      setAskInPopup({
        text,
        x: rect.left + rect.width / 2,
        y: rect.top - 10,
      });
    }
  }, [isPlatformChannel]);

  // Send quoted text to a target channel
  const handleAskIn = useCallback(async (targetChannelId: string) => {
    if (!askInPopup || !gatewayId) return;
    const sourceChannelName = activeChannel?.name || "unknown";
    // Switch to target channel
    setActiveChannelId(targetChannelId);
    setAskInPopup(null);
    window.getSelection()?.removeAllRanges();

    // Wait for channel switch, then inject the quoted context
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent("synapse:inject-quote", {
        detail: {
          text: askInPopup.text,
          sourceChannel: sourceChannelName,
        },
      }));
    }, 500);
  }, [askInPopup, gatewayId, activeChannel]);

  if (loading) {
    return (
      <AppShell title="Chat">
        <ChatSkeleton />
      </AppShell>
    );
  }

  return (
    <AppShell title="Chat">
      <div className="relative flex h-full">
        {/* Main chat area - takes full width now */}
        <div className="flex flex-1 flex-col min-w-0">
          {/* Mobile top bar */}
          <div className="flex items-center justify-between px-3 py-1 border-b border-white/[0.06] lg:hidden shrink-0 bg-white/[0.02] backdrop-blur-2xl">
            <div className="flex items-center gap-1 min-w-0">
              <span className="text-sm font-medium text-zinc-300 truncate">
                {activeChannel ? `#${activeChannel.name}` : "Chat"}
              </span>
            </div>
            <div className="flex items-center gap-0.5">
              <Button
                variant="ghost"
                size="icon"
                className="h-10 w-10 min-w-[44px] min-h-[44px] text-zinc-400 hover:text-zinc-200"
                onClick={() => setConvoSidebarOpen((v) => !v)}
              >
                <History className="h-4 w-4" />
              </Button>
              <Link href="/">
                <Button variant="ghost" size="icon" className="h-10 w-10 min-w-[44px] min-h-[44px] text-zinc-400 hover:text-zinc-200">
                  <LayoutDashboard className="h-4 w-4" />
                </Button>
              </Link>
            </div>
          </div>

          {/* Desktop channel header */}
          <div className="hidden lg:block">
            <div className="flex items-center">
              <div className="flex-1">
                <ChannelHeader
                  channel={activeChannel}
                  onToggleHistory={() => setConvoSidebarOpen((v) => !v)}
                  historyOpen={convoSidebarOpen}
                  sessionId={sessionId}
                  onSessionDeleted={() => { setSessionId(null); }}
                />
              </div>
            </div>
          </div>

          {/* Conversations drawer (right side) */}
          <ConversationsSidebar
            open={convoSidebarOpen}
            onClose={() => setConvoSidebarOpen(false)}
            sessionId={sessionId}
            onSelectConversation={handleSelectConversation}
          />

          {sessionId ? (
            <div className="flex flex-1 flex-col min-h-0 overflow-hidden" onMouseUp={handleMouseUp}>
              <div className="flex-1 overflow-y-auto min-h-0">
                <ChatWindow sessionId={sessionId} scrollToSeq={scrollToSeq} />
              </div>
              {gatewayId && !isPlatformChannel && <LiveAgentsPanel sessionId={sessionId} gatewayId={gatewayId} />}
              {isPlatformChannel ? (
                <div className="shrink-0 border-t border-white/[0.06] px-4 py-3 text-center text-xs text-zinc-500">
                  Read-only - highlight text and select "Ask in..." to discuss in another channel
                </div>
              ) : (
                <div className="shrink-0">
                  <ChatInput sessionId={sessionId} />
                </div>
              )}
              {askInPopup && (
                <AskInPopup
                  x={askInPopup.x}
                  y={askInPopup.y}
                  text={askInPopup.text}
                  channels={webChannels}
                  onSelect={handleAskIn}
                  onClose={() => setAskInPopup(null)}
                />
              )}
            </div>
          ) : (
            <div className="flex flex-1 items-center justify-center">
              <div className="text-center animate-fade-in max-w-md">
                <EmptyChatIllustration />
                <p className="text-lg font-medium text-zinc-300 mb-1">
                  {channels.length === 0 ? "Start a conversation" : "Loading channel..."}
                </p>
                <p className="text-sm text-zinc-500 mb-5">
                  {channels.length === 0 ? "Your AI assistant is ready. Try one of these to get started:" : "Setting up your session..."}
                </p>
                {channels.length === 0 && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {["What can you help me with?", "Summarize a topic for me", "Help me brainstorm ideas", "Write something creative"].map((prompt) => (
                      <button
                        key={prompt}
                        className="px-3 py-2.5 rounded-xl text-xs text-left text-zinc-400 bg-white/[0.04] hover:bg-white/[0.07] border border-white/10 hover:border-white/20 transition-all"
                        onClick={() => {
                          // Navigate to chat - the prompt will be pre-filled if there's a channel
                        }}
                      >
                        {prompt}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Create Channel Modal */}
        {showCreateChannel && (
          <>
            <div className="fixed inset-0 bg-black/50 z-50" onClick={() => setShowCreateChannel(false)} />
            <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-80 rounded-2xl border border-white/[0.12] bg-white/[0.07] backdrop-blur-3xl p-6 shadow-[0_16px_64px_rgba(0,0,0,0.4)]">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-zinc-200">Create Channel</h3>
                <button onClick={() => setShowCreateChannel(false)} className="text-zinc-500 hover:text-zinc-300">
                  <X className="h-4 w-4" />
                </button>
              </div>
              <input
                type="text"
                placeholder="channel-name"
                value={newChannelName}
                onChange={(e) => setNewChannelName(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-").slice(0, 50))}
                onKeyDown={(e) => e.key === "Enter" && handleCreateChannel()}
                maxLength={50}
                className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-primary/50 mb-3"
                autoFocus
              />
              <Button onClick={handleCreateChannel} size="sm" className="w-full" disabled={!newChannelName.trim()}>
                <Plus className="h-4 w-4 mr-1" />
                Create
              </Button>
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
