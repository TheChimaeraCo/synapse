"use client";

import { useState, useCallback, useRef, useEffect } from "react";

interface Message {
  _id: string;
  role: "user" | "assistant" | "system";
  content: string;
  model?: string;
  tokens?: { input: number; output: number };
  cost?: number;
  latencyMs?: number;
  _creationTime?: number;
}

interface UseChatOptions {
  sessionId: string;
  gatewayId: string;
}

export function useChat({ sessionId, gatewayId }: UseChatOptions) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const [loaded, setLoaded] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const fetchMessages = useCallback(async () => {
    try {
      const url = `/api/sessions/${sessionId}/messages?limit=500`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        if (data.error === "invalid_session") {
          console.warn("[useChat] Invalid session:", sessionId);
          setLoaded(true); // Still mark as loaded so UI doesn't hang
          return;
        }
        const serverMsgs: Message[] = data.messages || [];
        console.log(`[useChat] fetchMessages: ${serverMsgs.length} msgs for session ${sessionId}`);
        // Only replace messages if server returned non-empty
        // Filter out empty-content messages (tool-only responses, cleared messages)
        const filtered = serverMsgs.filter((m: Message) => m.content?.trim());
        if (filtered.length > 0) {
          setMessages(filtered);
        }
      } else {
        console.error("[useChat] fetchMessages HTTP error:", res.status);
      }
      setLoaded(true);
    } catch (e) {
      console.error("[useChat] fetchMessages error:", e);
      setLoaded(true); // Don't leave UI in loading state on error
    }
  }, [sessionId]);

  // Initial load
  useEffect(() => {
    fetchMessages();
  }, [fetchMessages]);

  // Poll for new messages (catches sub-agent injections, etc.)
  useEffect(() => {
    if (isStreaming) return; // don't poll while streaming
    const interval = setInterval(fetchMessages, 5000);
    return () => clearInterval(interval);
  }, [fetchMessages, isStreaming]);

  const streamingRef = useRef(false);

  // Keep ref in sync
  useEffect(() => { streamingRef.current = isStreaming; }, [isStreaming]);

  const sendMessage = useCallback(async (content: string) => {
    console.log("[useChat] sendMessage called:", { content: content.slice(0, 50), streaming: streamingRef.current, sessionId, gatewayId });
    if (streamingRef.current) {
      console.warn("[useChat] BLOCKED - streamingRef is true, resetting");
      streamingRef.current = false;
      setIsStreaming(false);
      return;
    }

    // Optimistically add user message
    const tempId = `temp-${Date.now()}`;
    const userMsg: Message = { _id: tempId, role: "user", content, _creationTime: Date.now() };
    setMessages((prev) => [...prev, userMsg]);
    setIsStreaming(true);
    setIsTyping(true);
    setStreamingContent("");

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch("/api/chat/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, content, gatewayId }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to send message");
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder();
      let buffer = "";
      let accumulated = "";
      let commandResult: any = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const data = JSON.parse(line.slice(6));

            if (data.type === "typing") {
              setIsTyping(true);
            } else if (data.type === "token") {
              setIsTyping(false);
              accumulated += data.content;
              setStreamingContent(accumulated);
            } else if (data.type === "command") {
              commandResult = data;
            } else if (data.type === "tool_use") {
              // Could show tool use indicator
            } else if (data.type === "agent_start" || data.type === "agent_complete") {
              window.dispatchEvent(new Event("synapse:agent_update"));
            } else if (data.type === "error") {
              setIsTyping(false);
              accumulated = `Error: ${data.message}`;
              setStreamingContent(accumulated);
            } else if (data.type === "done") {
              // Stream complete
            }
          } catch {}
        }
      }

      // If it was a command with action, handle client-side effects
      if (commandResult?.action === "new_session") {
        setIsStreaming(false);
        setIsTyping(false);
        return { action: "new_session" };
      }

      // If we got an error during streaming, show it as a failed message
      if (accumulated.startsWith("Error:") && accumulated.length > 6) {
        setMessages((prev) => [
          ...prev,
          {
            _id: `error-${Date.now()}`,
            role: "assistant",
            content: accumulated,
            _creationTime: Date.now(),
          },
        ]);
      } else {
        // Refresh messages from server to get the saved versions
        // Small delay to ensure Convex has written the assistant message
        await new Promise(r => setTimeout(r, 500));
        await fetchMessages();
      }
    } catch (err: any) {
      if (err.name === "AbortError") {
        // User cancelled - not an error
      } else {
        console.error("Chat stream error:", err);
        // Show error as a failed assistant message so user sees it and can retry
        const errorContent = err.message?.includes("Failed to fetch")
          ? "Error: Network error - please check your connection and try again."
          : `Error: ${err.message || "Something went wrong. Please try again."}`;
        setMessages((prev) => [
          ...prev,
          {
            _id: `error-${Date.now()}`,
            role: "assistant",
            content: errorContent,
            _creationTime: Date.now(),
          },
        ]);
      }
    } finally {
      setIsStreaming(false);
      setIsTyping(false);
      setStreamingContent("");
      abortRef.current = null;
    }

    return null;
  }, [sessionId, gatewayId, fetchMessages]);

  const stopStreaming = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const retryLastMessage = useCallback(async () => {
    // Find the last user message and resend it
    const lastUser = [...messages].reverse().find(m => m.role === "user");
    if (!lastUser) return;
    // Remove the failed assistant message(s) after the last user message
    const lastUserIdx = messages.lastIndexOf(lastUser);
    setMessages(prev => prev.slice(0, lastUserIdx));
    // Re-send
    await sendMessage(lastUser.content);
  }, [messages, sendMessage]);

  return {
    messages,
    isStreaming,
    isTyping,
    streamingContent,
    loaded,
    sendMessage,
    stopStreaming,
    retryLastMessage,
    refreshMessages: fetchMessages,
  };
}
