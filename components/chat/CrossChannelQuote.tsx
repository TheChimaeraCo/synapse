"use client";

import { MessageSquareQuote } from "lucide-react";

interface CrossChannelQuoteProps {
  sourceChannelName: string;
  quotedText: string;
}

export function CrossChannelQuote({ sourceChannelName, quotedText }: CrossChannelQuoteProps) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-white/[0.08] bg-white/[0.04] backdrop-blur-xl px-4 py-3 mb-3">
      <MessageSquareQuote className="h-4 w-4 text-zinc-500 mt-0.5 shrink-0" />
      <div className="min-w-0">
        <span className="text-[10px] text-zinc-500 font-medium">
          Quoted from #{sourceChannelName}
        </span>
        <p className="text-xs text-zinc-400 mt-0.5 line-clamp-3 italic">
          {quotedText}
        </p>
      </div>
    </div>
  );
}
