"use client";

import { use, useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import { AppShell } from "@/components/layout/AppShell";
import { ChatWindow } from "@/components/chat/ChatWindow";
import { ChatInput } from "@/components/chat/ChatInput";
import { DropZone } from "@/components/chat/DropZone";
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
  const { data: session } = useSession();
  const gatewayId = (session?.user as any)?.gatewayId;
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [scrollToSeq, setScrollToSeq] = useState<number | null>(null);

  const handleSelectConversation = useCallback((_id: string, startSeq?: number) => {
    setScrollToSeq(startSeq ?? null);
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
          onSelectConversation={handleSelectConversation}
        />

        <DropZone sessionId={sessionId}>
          <ChatWindow sessionId={sessionId} scrollToSeq={scrollToSeq} />
          {gatewayId && <LiveAgentsPanel sessionId={sessionId} gatewayId={gatewayId} />}
          <ChatInput sessionId={sessionId} />
        </DropZone>
      </div>
    </AppShell>
  );
}
