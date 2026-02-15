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

export function ConversationSavedDivider({ conversationId }: { conversationId: string }) {
  const data = useConversationData(conversationId);

  return (
    <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-4 my-6 text-center backdrop-blur-xl">
      <div className="text-white/15 text-[10px] tracking-[0.2em] uppercase mb-2 font-medium">
        ── topic shift ──
      </div>
      {data?.title && (
        <div className="text-zinc-300 text-sm font-medium mb-1">{data.title}</div>
      )}
      {data?.summary && (
        <div className="text-zinc-500 text-xs mb-2 max-w-lg mx-auto">{data.summary}</div>
      )}
      {data?.tags && data.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 justify-center">
          {data.tags.map((t, i) => (
            <span key={i} className="bg-blue-500/15 text-blue-300/80 px-2 py-0.5 rounded-full text-xs">
              {t}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
