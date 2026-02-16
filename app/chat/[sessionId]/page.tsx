"use client";

import { use, useState, useCallback, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { gatewayFetch } from "@/lib/gatewayFetch";
import { AppShell } from "@/components/layout/AppShell";
import { ChatWindow } from "@/components/chat/ChatWindow";
import { ChatInput } from "@/components/chat/ChatInput";
import { LiveAgentsPanel } from "@/components/chat/LiveAgentsPanel";
import { ConversationsSidebar } from "@/components/chat/ConversationsSidebar";
import { Button } from "@/components/ui/button";
import { MessageSquare } from "lucide-react";

export default function ChatSessionPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = use(params);
  const router = useRouter();
  const { data: session } = useSession();
  const gatewayId = (session?.user as any)?.gatewayId;
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);

  // Load active conversation for this session
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/conversations?sessionId=${sessionId}&limit=1`);
        if (res.ok) {
          const data = await res.json();
          const convos = data.conversations || [];
          if (convos.length > 0 && convos[0].status === "active") {
            setConversationId(convos[0]._id);
          }
        }
      } catch {}
    })();
  }, [sessionId]);

  const handleNewChat = useCallback(async () => {
    if (!sessionId) return;
    try {
      const res = await gatewayFetch("/api/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId }),
      });
      if (res.ok) {
        const data = await res.json();
        setConversationId(data.conversationId);
      }
    } catch {}
  }, [sessionId]);

  const handleSelectConversation = useCallback((id: string) => {
    setConversationId(id);
  }, []);

  return (
    <AppShell title="Chat">
      <div className="relative flex h-full flex-col -m-4 lg:-m-6">
        <Button
          variant="ghost"
          size="icon"
          className="absolute top-2 left-2 z-30 h-8 w-8 text-zinc-400 hover:text-zinc-200"
          onClick={() => setSidebarOpen((v) => !v)}
        >
          <MessageSquare className="h-4 w-4" />
        </Button>

        <ConversationsSidebar
          open={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          sessionId={sessionId}
          activeConversationId={conversationId}
          onSelectConversation={handleSelectConversation}
          onNewChat={handleNewChat}
        />

        <ChatWindow sessionId={sessionId} conversationId={conversationId} />
        {gatewayId && <LiveAgentsPanel sessionId={sessionId} gatewayId={gatewayId} />}
        <ChatInput sessionId={sessionId} />
      </div>
    </AppShell>
  );
}
