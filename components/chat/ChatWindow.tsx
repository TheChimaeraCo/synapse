"use client";
import { gatewayFetch } from "@/lib/gatewayFetch";

import { useEffect, useRef, useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import { MessageBubble } from "./MessageBubble";
import { ConversationSavedDivider } from "./ConversationDivider";
import { ToolApprovalsPopup } from "./ToolApprovalsPopup";
import { Skeleton } from "@/components/ui/skeleton";
import { useChat } from "@/hooks/useChat";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ArrowDown } from "lucide-react";
import { toast } from "sonner";

interface ConversationBookmark {
  _id: string;
  title?: string;
  tags?: string[];
  startSeq?: number;
  endSeq?: number;
  status: string;
}

export function ChatWindow({ sessionId, scrollToSeq }: { sessionId: string; scrollToSeq?: number | null }) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const prevCountRef = useRef(0);
  const prevStreamRef = useRef("");
  const lastAssistantIdRef = useRef<string | null>(null);
  const assistantEventInitializedRef = useRef(false);
  const initialScrollDone = useRef(false);
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const userScrolledUp = useRef(false);
  const { data: session } = useSession();
  const gatewayId = (session?.user as any)?.gatewayId;
  const [conversations, setConversations] = useState<ConversationBookmark[]>([]);
  const [pinnedMessageIds, setPinnedMessageIds] = useState<Set<string>>(new Set());
  const getScrollContainer = useCallback(
    () => scrollContainerRef.current?.closest(".overflow-y-auto") as HTMLElement | null,
    []
  );

  // Fetch pinned messages
  const fetchPins = useCallback(async () => {
    try {
      const res = await gatewayFetch(`/api/sessions/${sessionId}/pins`);
      if (res.ok) {
        const data = await res.json();
        const ids = new Set<string>((data.pins || []).map((p: any) => p.messageId));
        setPinnedMessageIds(ids);
      }
    } catch {}
  }, [sessionId]);

  useEffect(() => { fetchPins(); }, [fetchPins]);

  const handleBranch = useCallback(async (messageId: string) => {
    try {
      const res = await gatewayFetch(`/api/sessions/${sessionId}/branch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messageId }),
      });
      if (!res.ok) throw new Error("Branch failed");
      const data = await res.json();
      toast.success("Branched! Redirecting...");
      window.location.href = `/chat/${data.sessionId}`;
    } catch (err: any) {
      toast.error(err.message || "Failed to branch");
    }
  }, [sessionId]);

  const handlePin = useCallback(async (messageId: string) => {
    const isPinned = pinnedMessageIds.has(messageId);
    try {
      if (isPinned) {
        await gatewayFetch(`/api/sessions/${sessionId}/pins`, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messageId }),
        });
        setPinnedMessageIds((prev) => { const next = new Set(prev); next.delete(messageId); return next; });
        toast.success("Unpinned");
      } else {
        await gatewayFetch(`/api/sessions/${sessionId}/pins`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messageId }),
        });
        setPinnedMessageIds((prev) => new Set(prev).add(messageId));
        toast.success("Pinned!");
      }
    } catch {
      toast.error("Failed to update pin");
    }
  }, [sessionId, pinnedMessageIds]);

  // Fetch conversation bookmarks
  const fetchConversations = useCallback(async () => {
    if (!gatewayId) return;
    try {
      const res = await gatewayFetch(`/api/conversations?gatewayId=${gatewayId}&limit=100`);
      if (res.ok) {
        const data = await res.json();
        setConversations(Array.isArray(data) ? data : data.conversations || []);
      }
    } catch {}
  }, [gatewayId]);

  useEffect(() => { fetchConversations(); }, [fetchConversations]);
  // Refresh conversations periodically (topic classifier creates them async)
  useEffect(() => {
    const interval = setInterval(fetchConversations, 15000);
    return () => clearInterval(interval);
  }, [fetchConversations]);

  const {
    messages,
    isStreaming,
    isTyping,
    toolStatus,
    toolLogs,
    streamingContent,
    loaded,
    sendMessage,
    stopStreaming,
    retryLastMessage,
    refreshMessages,
  } = useChat({ sessionId, gatewayId: gatewayId || "" });

  // Expose sendMessage to parent via window (ChatInput needs it)
  useEffect(() => {
    (window as any).__synapse_chat = { sendMessage, stopStreaming, retryLastMessage, isStreaming, gatewayId };
    return () => { delete (window as any).__synapse_chat; };
  }, [sendMessage, stopStreaming, retryLastMessage, isStreaming, gatewayId]);

  // Scroll to seq when user clicks a conversation bookmark
  useEffect(() => {
    if (!scrollToSeq || !loaded) return;
    const timer = setTimeout(() => {
      const container = getScrollContainer();
      if (!container) return;
      const el = document.getElementById(`msg-seq-${scrollToSeq}`);
      if (el) {
        const containerRect = container.getBoundingClientRect();
        const targetRect = el.getBoundingClientRect();
        const top = container.scrollTop + (targetRect.top - containerRect.top) - 16;
        container.scrollTo({ top: Math.max(top, 0), behavior: "smooth" });
      }
    }, 100);
    return () => clearTimeout(timer);
  }, [getScrollContainer, scrollToSeq, loaded]);

  // Initial scroll to bottom once loaded
  useEffect(() => {
    if (loaded && !initialScrollDone.current) {
      initialScrollDone.current = true;
      setTimeout(() => {
        const container = getScrollContainer();
        if (!container) return;
        container.scrollTo({ top: container.scrollHeight, behavior: "auto" });
        userScrolledUp.current = false;
        setShowScrollBtn(false);
      }, 50);
    }
  }, [getScrollContainer, loaded]);

  // Track scroll position to show/hide scroll-to-bottom button
  useEffect(() => {
    const container = getScrollContainer();
    if (!container) return;
    const handleScroll = () => {
      const distFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
      const isNearBottom = distFromBottom < 100;
      setShowScrollBtn(!isNearBottom);
      userScrolledUp.current = !isNearBottom;
    };
    container.addEventListener("scroll", handleScroll, { passive: true });
    return () => container.removeEventListener("scroll", handleScroll);
  }, [getScrollContainer, loaded]);

  // Auto-scroll on new messages / streaming (only if user hasn't scrolled up)
  useEffect(() => {
    const newCount = messages.length;
    const newStream = streamingContent || "";
    if (newCount > prevCountRef.current || newStream.length > prevStreamRef.current.length) {
      if (!userScrolledUp.current) {
        const container = getScrollContainer();
        if (container) {
          container.scrollTo({ top: container.scrollHeight, behavior: "smooth" });
        }
      }
    }
    prevCountRef.current = newCount;
    prevStreamRef.current = newStream;
  }, [getScrollContainer, messages.length, streamingContent]);

  // Initialize assistant event baseline from loaded history once.
  useEffect(() => {
    if (!loaded || assistantEventInitializedRef.current) return;
    assistantEventInitializedRef.current = true;
    const latestAssistant = [...messages]
      .reverse()
      .find((m) => m.role === "assistant" && m.content?.trim());
    if (latestAssistant) {
      lastAssistantIdRef.current = latestAssistant._id;
    }
  }, [loaded, messages]);

  // Emit assistant message events for voice-mode orchestration.
  useEffect(() => {
    if (!loaded || messages.length === 0) return;
    const latestAssistant = [...messages]
      .reverse()
      .find((m) => m.role === "assistant" && m.content?.trim());
    if (!latestAssistant) return;

    if (latestAssistant._id !== lastAssistantIdRef.current) {
      lastAssistantIdRef.current = latestAssistant._id;
      console.log("[Voice] Dispatching assistant_message event", latestAssistant._id);
      window.dispatchEvent(
        new CustomEvent("synapse:assistant_message", {
          detail: {
            messageId: latestAssistant._id,
            content: latestAssistant.content,
            sessionId,
            createdAt: latestAssistant._creationTime,
          },
        })
      );
    }
  }, [loaded, messages, sessionId]);

  const scrollToBottom = useCallback(() => {
    const container = getScrollContainer();
    if (container) {
      container.scrollTo({ top: container.scrollHeight, behavior: "smooth" });
    }
    userScrolledUp.current = false;
    setShowScrollBtn(false);
  }, [getScrollContainer]);

  if (!loaded) {
    return (
      <div className="flex flex-1 flex-col gap-4 p-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-3/4 rounded-lg" />
        ))}
      </div>
    );
  }

  return (
    <div ref={scrollContainerRef} className="flex flex-1 flex-col px-4 py-6 sm:px-6 relative bg-transparent">
      {messages.length === 0 && !isStreaming && (
        <div className="flex flex-1 items-center justify-center">
          <p className="text-muted-foreground">
            Send a message to start the conversation
          </p>
        </div>
      )}

      <div className="flex flex-col gap-4 max-w-4xl mx-auto w-full">
        {messages.map((msg: any, idx: number) => {
          // Check if a closed conversation ends right before this message
          const closedConvo = conversations.find(
            (c) => c.status === "closed" && c.endSeq != null && msg.seq != null && msg.seq === (c.endSeq! + 1)
          );
          // Show timestamp divider if 5+ minute gap from previous message
          const prevMsg = idx > 0 ? messages[idx - 1] : null;
          const showTimestamp = prevMsg && msg._creationTime && prevMsg._creationTime &&
            (msg._creationTime - prevMsg._creationTime) >= 5 * 60 * 1000;
          return (
            <div key={msg._id}>
              {closedConvo && (
                <ConversationSavedDivider conversationId={closedConvo._id} />
              )}
              {showTimestamp && (
                <div className="flex justify-center py-2">
                  <span className="text-[10px] text-zinc-500 bg-white/[0.03] px-3 py-1 rounded-full">
                    {new Date(msg._creationTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              )}
              <div id={msg.seq ? `msg-seq-${msg.seq}` : undefined}>
                <MessageBubble message={msg} onRetry={() => retryLastMessage()} onBranch={handleBranch} onPin={handlePin} isPinned={pinnedMessageIds.has(msg._id)} />
              </div>
            </div>
          );
        })}

        {streamingContent && (
          <div className="flex justify-start">
            <div className="max-w-[92%] sm:max-w-[75%] rounded-2xl rounded-bl-md border border-white/[0.14] bg-white/[0.05] backdrop-blur-2xl px-5 py-3 text-sm animate-fade-in shadow-[0_12px_24px_rgba(6,12,24,0.24)]">
              <div className="prose prose-invert prose-sm max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {streamingContent}
                </ReactMarkdown>
              </div>
              <span className="inline-block h-4 w-0.5 animate-pulse bg-primary ml-0.5" />
            </div>
          </div>
        )}

        {(isTyping || isStreaming || (toolLogs && toolLogs.length > 0)) && (
          <div className="flex justify-start">
            <div className="max-w-[92%] sm:max-w-[75%] rounded-2xl rounded-bl-md border border-white/[0.14] bg-white/[0.05] backdrop-blur-2xl px-5 py-3 space-y-2 shadow-[0_10px_20px_rgba(6,12,24,0.2)]">
              {toolLogs && toolLogs.length > 0 && (
                <div className="space-y-1 max-h-32 overflow-y-auto">
                  {toolLogs.map((log, i) => (
                    <div key={i} className="flex items-center gap-2 text-[10px] font-mono">
                      <span className={log.success ? "text-green-400" : "text-red-400"}>
                        {log.success ? "✓" : "✗"}
                      </span>
                      <span className="text-zinc-500">R{log.round}</span>
                      <span className="text-blue-300">{log.tool}</span>
                      <span className="text-zinc-600 truncate max-w-[200px]">{log.summary}</span>
                    </div>
                  ))}
                </div>
              )}
              {isTyping && (
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-blue-400/60 animate-bounce" style={{ animationDelay: "0ms" }} />
                  <span className="h-2 w-2 rounded-full bg-blue-400/60 animate-bounce" style={{ animationDelay: "150ms" }} />
                  <span className="h-2 w-2 rounded-full bg-blue-400/60 animate-bounce" style={{ animationDelay: "300ms" }} />
                  {toolStatus && (
                    <span className="ml-2 text-xs text-cyan-200/80 font-mono">{toolStatus}</span>
                  )}
                  <button
                    onClick={stopStreaming}
                    className="ml-auto px-2 py-0.5 rounded-md text-[10px] text-red-400 hover:text-red-300 hover:bg-red-500/10 border border-red-500/20 transition-all font-medium"
                  >
                    Stop
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <div ref={bottomRef} />

      {/* Scroll to bottom button */}
      {showScrollBtn && (
        <button
          onClick={scrollToBottom}
          aria-label="Scroll to bottom - new messages"
          className="sticky bottom-4 left-1/2 -translate-x-1/2 z-10 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/[0.14] border border-cyan-300/30 backdrop-blur-xl text-xs text-zinc-100 hover:bg-white/[0.2] transition-all shadow-[0_10px_22px_rgba(6,182,212,0.25)]"
        >
          <ArrowDown className="h-3.5 w-3.5" />
          New messages
        </button>
      )}

      <ToolApprovalsPopup sessionId={sessionId} />
    </div>
  );
}
