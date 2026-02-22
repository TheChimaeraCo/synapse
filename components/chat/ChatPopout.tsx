"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { gatewayFetch } from "@/lib/gatewayFetch";
import { Button } from "@/components/ui/button";
import { ChatWindow } from "@/components/chat/ChatWindow";
import { ChatInput } from "@/components/chat/ChatInput";
import { LiveAgentsPanel } from "@/components/chat/LiveAgentsPanel";
import { MessageSquare, X, Minimize2, Loader2, ExternalLink } from "lucide-react";

const SESSION_KEY = "synapse-popout-session-id";
const OPEN_KEY = "synapse-popout-open";

export function ChatPopout() {
  const pathname = usePathname();
  const { data: authSession } = useSession();
  const gatewayId = (authSession?.user as any)?.gatewayId as string | undefined;

  const [open, setOpen] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onChatPage = pathname?.startsWith("/chat");

  useEffect(() => {
    setHydrated(true);
    if (typeof window === "undefined") return;
    const nextOpen = localStorage.getItem(OPEN_KEY) === "true";
    const savedSessionId = localStorage.getItem(SESSION_KEY);
    setOpen(nextOpen);
    if (savedSessionId) setSessionId(savedSessionId);
  }, []);

  useEffect(() => {
    if (!hydrated || typeof window === "undefined") return;
    localStorage.setItem(OPEN_KEY, open ? "true" : "false");
  }, [hydrated, open]);

  useEffect(() => {
    if (!hydrated || typeof window === "undefined") return;
    const handler = (event: Event) => {
      const detail = (event as CustomEvent).detail as { sessionId?: string } | undefined;
      if (!detail?.sessionId) return;
      setSessionId(detail.sessionId);
      localStorage.setItem(SESSION_KEY, detail.sessionId);
    };
    window.addEventListener("synapse:active-session", handler);
    return () => window.removeEventListener("synapse:active-session", handler);
  }, [hydrated]);

  const ensureSession = useCallback(async () => {
    if (!gatewayId || loading) return;
    setLoading(true);
    setError(null);
    try {
      let candidate = sessionId;
      if (!candidate && typeof window !== "undefined") {
        candidate = localStorage.getItem(SESSION_KEY);
      }

      if (candidate) {
        const verify = await gatewayFetch(`/api/sessions/${candidate}`);
        if (verify.ok) {
          setSessionId(candidate);
          if (typeof window !== "undefined") localStorage.setItem(SESSION_KEY, candidate);
          return;
        }
      }

      const recentRes = await gatewayFetch("/api/sessions/recent");
      if (!recentRes.ok) throw new Error("Failed to load recent chat session");
      const recent = await recentRes.json();
      const nextSessionId = recent?._id as string | undefined;
      if (!nextSessionId) throw new Error("No recent session available");
      setSessionId(nextSessionId);
      if (typeof window !== "undefined") localStorage.setItem(SESSION_KEY, nextSessionId);
    } catch (err: any) {
      setError(err?.message || "Unable to initialize popout chat");
    } finally {
      setLoading(false);
    }
  }, [gatewayId, loading, sessionId]);

  useEffect(() => {
    if (!open || !hydrated || onChatPage || !gatewayId) return;
    if (sessionId) return;
    void ensureSession();
  }, [ensureSession, gatewayId, hydrated, onChatPage, open, sessionId]);

  if (!hydrated || onChatPage || !gatewayId) return null;

  return (
    <>
      {!open && (
        <Button
          type="button"
          onClick={() => setOpen(true)}
          className="fixed bottom-5 right-5 z-[70] h-12 px-4 rounded-full bg-gradient-to-r from-cyan-500/90 to-blue-600/90 text-white shadow-[0_0_30px_rgba(56,189,248,0.35)] hover:from-cyan-400 hover:to-blue-500"
          aria-label="Open chat popout"
        >
          <MessageSquare className="h-4 w-4 mr-2" />
          Chat
        </Button>
      )}

      {open && (
        <div className="fixed bottom-3 right-3 left-3 sm:left-auto sm:w-[680px] h-[80vh] sm:h-[78vh] z-[70] rounded-2xl border border-white/[0.1] bg-zinc-950/90 backdrop-blur-2xl shadow-[0_24px_80px_rgba(0,0,0,0.55)] overflow-hidden flex flex-col">
          <div className="shrink-0 flex items-center justify-between px-4 py-2.5 border-b border-white/[0.08] bg-white/[0.03]">
            <div className="flex items-center gap-2 min-w-0">
              <span className="h-2.5 w-2.5 rounded-full bg-cyan-400 animate-pulse" />
              <p className="text-sm font-medium text-zinc-200 truncate">Live Conversation</p>
            </div>
            <div className="flex items-center gap-1">
              {sessionId && (
                <Link href={`/chat/${sessionId}`} className="inline-flex">
                  <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-zinc-400 hover:text-zinc-200" aria-label="Open full chat page">
                    <ExternalLink className="h-4 w-4" />
                  </Button>
                </Link>
              )}
              <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-zinc-400 hover:text-zinc-200" onClick={() => setOpen(false)} aria-label="Minimize chat popout">
                <Minimize2 className="h-4 w-4" />
              </Button>
              <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-zinc-400 hover:text-zinc-200" onClick={() => setOpen(false)} aria-label="Close chat popout">
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {!sessionId ? (
            <div className="flex-1 flex items-center justify-center px-6 text-center">
              {loading ? (
                <div className="text-zinc-400 text-sm flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading conversation...
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-sm text-zinc-400">{error || "No conversation selected yet."}</p>
                  <Button onClick={() => void ensureSession()} size="sm">Start Chat</Button>
                </div>
              )}
            </div>
          ) : (
            <>
              <div className="flex-1 min-h-0 overflow-y-auto">
                <ChatWindow sessionId={sessionId} />
              </div>
              {gatewayId && <LiveAgentsPanel sessionId={sessionId} gatewayId={gatewayId} />}
              <div className="shrink-0">
                <ChatInput sessionId={sessionId} />
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}
