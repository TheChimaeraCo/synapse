"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface ActiveRun {
  status: "thinking" | "streaming" | "complete" | "error";
  streamedContent?: string;
  error?: string;
}

export function StreamingIndicator({ activeRun }: { activeRun: ActiveRun }) {
  if (activeRun.status === "error") {
    return (
      <div className="flex justify-start">
        <div className="max-w-[75%] rounded-2xl rounded-bl-md border border-red-500/20 bg-red-500/[0.08] px-5 py-3 text-sm text-red-400 backdrop-blur-2xl">
          Error: {activeRun.error || "Something went wrong"}
        </div>
      </div>
    );
  }

  if (activeRun.status === "thinking") {
    return (
      <div className="flex justify-start">
        <div className="max-w-[75%] rounded-2xl rounded-bl-md border border-white/[0.08] bg-white/[0.04] backdrop-blur-2xl px-5 py-3">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span className="inline-flex gap-1">
              <span className="animate-pulse">Thinking</span>
              <span className="animate-bounce" style={{ animationDelay: "0ms" }}>.</span>
              <span className="animate-bounce" style={{ animationDelay: "150ms" }}>.</span>
              <span className="animate-bounce" style={{ animationDelay: "300ms" }}>.</span>
            </span>
          </div>
        </div>
      </div>
    );
  }

  if (activeRun.status === "streaming" && activeRun.streamedContent) {
    return (
      <div className="flex justify-start">
        <div className="max-w-[75%] rounded-2xl rounded-bl-md border border-white/[0.08] bg-white/[0.04] backdrop-blur-2xl px-5 py-3 text-sm">
          <div className="prose prose-invert prose-sm max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {activeRun.streamedContent}
            </ReactMarkdown>
          </div>
          <span className="inline-block h-4 w-0.5 animate-pulse bg-primary ml-0.5" />
        </div>
      </div>
    );
  }

  return null;
}
