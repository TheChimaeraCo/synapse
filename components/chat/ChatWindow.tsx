"use client";
import { gatewayFetch } from "@/lib/gatewayFetch";

import { useEffect, useRef, useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import { MessageBubble } from "./MessageBubble";
import { ConversationSavedDivider } from "./ConversationDivider";
import { Skeleton } from "@/components/ui/skeleton";
import { useChat } from "@/hooks/useChat";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

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
  const prevCountRef = useRef(0);
  const prevStreamRef = useRef("");
  const initialScrollDone = useRef(false);
  const { data: session } = useSession();
  const gatewayId = (session?.user as any)?.gatewayId;
  const [conversations, setConversations] = useState<ConversationBookmark[]>([]);

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
    streamingContent,
    loaded,
    sendMessage,
    stopStreaming,
    refreshMessages,
  } = useChat({ sessionId, gatewayId: gatewayId || "" });

  // Expose sendMessage to parent via window (ChatInput needs it)
  useEffect(() => {
    (window as any).__synapse_chat = { sendMessage, stopStreaming, isStreaming, gatewayId };
    return () => { delete (window as any).__synapse_chat; };
  }, [sendMessage, stopStreaming, isStreaming, gatewayId]);

  // Scroll to seq when user clicks a conversation bookmark
  useEffect(() => {
    if (!scrollToSeq || !loaded) return;
    const timer = setTimeout(() => {
      const el = document.getElementById(`msg-seq-${scrollToSeq}`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }, 100);
    return () => clearTimeout(timer);
  }, [scrollToSeq, loaded]);

  // Initial scroll to bottom once loaded
  useEffect(() => {
    if (loaded && !initialScrollDone.current) {
      initialScrollDone.current = true;
      setTimeout(() => {
        bottomRef.current?.scrollIntoView({ behavior: "auto" });
      }, 50);
    }
  }, [loaded]);

  // Auto-scroll on new messages / streaming
  useEffect(() => {
    const newCount = messages.length;
    const newStream = streamingContent || "";
    if (newCount > prevCountRef.current || newStream.length > prevStreamRef.current.length) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
    prevCountRef.current = newCount;
    prevStreamRef.current = newStream;
  }, [messages.length, streamingContent]);

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
    <div className="flex flex-1 flex-col px-4 py-6 sm:px-6">
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
          return (
            <div key={msg._id}>
              {closedConvo && (
                <ConversationSavedDivider conversationId={closedConvo._id} />
              )}
              <div id={msg.seq ? `msg-seq-${msg.seq}` : undefined}>
                <MessageBubble message={msg} />
              </div>
            </div>
          );
        })}

        {isTyping && (
          <div className="flex justify-start">
            <div className="max-w-[92%] sm:max-w-[75%] rounded-2xl rounded-bl-md border border-white/[0.08] bg-white/[0.04] backdrop-blur-2xl px-5 py-3">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-blue-400/60 animate-bounce" style={{ animationDelay: "0ms" }} />
                <span className="h-2 w-2 rounded-full bg-blue-400/60 animate-bounce" style={{ animationDelay: "150ms" }} />
                <span className="h-2 w-2 rounded-full bg-blue-400/60 animate-bounce" style={{ animationDelay: "300ms" }} />
              </div>
            </div>
          </div>
        )}

        {streamingContent && (
          <div className="flex justify-start">
            <div className="max-w-[92%] sm:max-w-[75%] rounded-2xl rounded-bl-md border border-white/[0.08] bg-white/[0.04] backdrop-blur-2xl px-5 py-3 text-sm animate-fade-in">
              <div className="prose prose-invert prose-sm max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {streamingContent}
                </ReactMarkdown>
              </div>
              <span className="inline-block h-4 w-0.5 animate-pulse bg-primary ml-0.5" />
            </div>
          </div>
        )}
      </div>

      <div ref={bottomRef} />
    </div>
  );
}
