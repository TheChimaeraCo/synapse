"use client";
import { gatewayFetch } from "@/lib/gatewayFetch";

import { useEffect, useState } from "react";

interface ConversationData {
  _id: string;
  title?: string;
  summary?: string;
  tags?: string[];
  startSeq?: number;
  endSeq?: number;
  status: string;
}

const convoCache = new Map<string, ConversationData>();

function useConversationData(convoId: string | undefined) {
  const [data, setData] = useState<ConversationData | null>(
    convoId ? convoCache.get(convoId) || null : null
  );

  useEffect(() => {
    if (!convoId) return;
    if (convoCache.has(convoId)) {
      setData(convoCache.get(convoId)!);
      return;
    }
    gatewayFetch(`/api/conversations/${convoId}`)
      .then((r) => r.json())
      .then((d) => {
        const convo = d.conversation || d;
        if (convo._id) {
          convoCache.set(convoId, convo);
          setData(convo);
        }
      })
      .catch(() => {});
  }, [convoId]);

  return data;
}

export function ConversationSavedDivider({
  conversationId,
  conversation,
}: {
  conversationId?: string;
  conversation?: ConversationData | null;
}) {
  const fetched = useConversationData(conversationId);
  const data = conversation ?? fetched;

  return (
    <div className="my-6">
      <div className="flex items-center gap-3 text-white/40 text-[10px] tracking-[0.24em] uppercase font-medium">
        <span className="h-px flex-1 bg-white/[0.12]" />
        <span>New Convo</span>
        <span className="h-px flex-1 bg-white/[0.12]" />
      </div>
      <div className="mt-2 rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2.5 backdrop-blur-xl">
        {data?.title ? (
          <div className="text-zinc-300 text-xs font-medium mb-1">{data.title}</div>
        ) : null}
        <div className="text-zinc-500 text-xs">
          {data?.summary?.trim() || "Starting a new conversation thread."}
        </div>
      </div>
    </div>
  );
}
