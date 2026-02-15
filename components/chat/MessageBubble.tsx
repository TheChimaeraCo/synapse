"use client";
import { gatewayFetch } from "@/lib/gatewayFetch";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import { cn, formatRelativeTime, formatCost, formatTokens } from "@/lib/utils";
import type { MessageDisplay } from "@/lib/types";
import { useState, useRef } from "react";
import { Check, Copy, Download, FileIcon, ImageIcon, Volume2, Loader2 } from "lucide-react";

function CodeBlock({ language, children }: { language?: string; children: string }) {
  const [copied, setCopied] = useState(false);

  const copy = () => {
    navigator.clipboard.writeText(children);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative group/code my-3 rounded-xl overflow-hidden border border-white/[0.08] shadow-[0_4px_16px_rgba(0,0,0,0.2)]">
      <div className="flex items-center justify-between bg-white/[0.06] px-4 py-2 text-xs text-zinc-400">
        <span>{language || "text"}</span>
        <button onClick={copy} className="flex items-center gap-1 hover:text-white transition-colors">
          {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <SyntaxHighlighter
        style={oneDark}
        language={language || "text"}
        PreTag="div"
        customStyle={{
          margin: 0,
          borderRadius: 0,
          fontSize: "0.8rem",
          background: "#1e1e2e",
        }}
      >
        {children}
      </SyntaxHighlighter>
    </div>
  );
}

const FILE_REF_REGEX = /\[file:([^\]:]+):([^\]]+)\]/g;

function extractFileRefs(content: string): { id: string; filename: string }[] {
  const refs: { id: string; filename: string }[] = [];
  let match;
  while ((match = FILE_REF_REGEX.exec(content)) !== null) {
    refs.push({ id: match[1], filename: match[2] });
  }
  return refs;
}

function stripFileRefs(content: string): string {
  return content.replace(FILE_REF_REGEX, "").trim();
}

function FileAttachment({ id, filename }: { id: string; filename: string }) {
  const isImage = /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(filename) || filename.match(/^image/);
  const [expanded, setExpanded] = useState(false);
  const url = `/api/files/${id}`;

  if (isImage) {
    return (
      <div className="my-1">
        <img
          src={url}
          alt={filename}
          className={cn(
            "rounded-lg border border-white/10 cursor-pointer transition-all",
            expanded ? "max-w-full" : "max-w-[300px] max-h-[200px] object-cover"
          )}
          onClick={() => setExpanded(!expanded)}
          loading="lazy"
        />
      </div>
    );
  }

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-2 my-1 px-3 py-2 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 transition-colors text-sm"
    >
      <FileIcon className="h-4 w-4 text-zinc-400 shrink-0" />
      <span className="text-blue-400 truncate">{filename}</span>
      <Download className="h-3.5 w-3.5 text-zinc-500 shrink-0 ml-auto" />
    </a>
  );
}

function ReadAloudButton({ text }: { text: string }) {
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const handlePlay = async () => {
    if (playing && audioRef.current) {
      audioRef.current.pause();
      setPlaying(false);
      return;
    }
    setPlaying(true);
    try {
      const res = await gatewayFetch("/api/voice/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: text.slice(0, 5000) }),
      });
      if (!res.ok) throw new Error("TTS failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => { setPlaying(false); URL.revokeObjectURL(url); };
      audio.onerror = () => { setPlaying(false); URL.revokeObjectURL(url); };
      audio.play();
    } catch {
      setPlaying(false);
    }
  };

  return (
    <button onClick={handlePlay} className="hover:text-white transition-colors" title={playing ? "Stop" : "Read aloud"}>
      {playing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Volume2 className="h-3 w-3" />}
    </button>
  );
}

function TelegramAccessActions({ message }: { message: MessageDisplay }) {
  const [loading, setLoading] = useState<string | null>(null);
  const [resolved, setResolved] = useState<string | null>(null);
  const meta = message.metadata as any;
  if (!meta || meta.type !== "telegram_access_request") return null;
  if (meta.type === "telegram_access_resolved" || resolved) {
    return (
      <span className="text-xs text-zinc-400 mt-1">
        {resolved === "approve" || meta.action === "approve" ? "✅ Approved" : "❌ Blocked"}
      </span>
    );
  }

  const handleAction = async (action: "approve" | "block") => {
    setLoading(action);
    try {
      const res = await gatewayFetch("/api/telegram-auth", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action,
          telegramId: meta.telegramId,
          messageId: message._id,
        }),
      });
      if (res.ok) setResolved(action);
    } catch (e) {
      console.error("Action failed:", e);
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="flex gap-2 mt-2">
      <button
        onClick={() => handleAction("approve")}
        disabled={!!loading}
        className="px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-600/80 hover:bg-emerald-500 text-white transition-colors disabled:opacity-50"
      >
        {loading === "approve" ? "..." : "✅ Approve"}
      </button>
      <button
        onClick={() => handleAction("block")}
        disabled={!!loading}
        className="px-3 py-1.5 rounded-lg text-xs font-medium bg-red-600/80 hover:bg-red-500 text-white transition-colors disabled:opacity-50"
      >
        {loading === "block" ? "..." : "❌ Block"}
      </button>
    </div>
  );
}

export function MessageBubble({ message }: { message: MessageDisplay }) {
  const isUser = message.role === "user";
  const isSystem = message.role === "system";

  if (isSystem) {
    const meta = (message as any).metadata;
    const hasActions = meta?.type === "telegram_access_request" && meta?.actions;
    const isResolved = meta?.type === "telegram_access_resolved";

    return (
      <div className="flex justify-center">
        <div className={cn(
          "rounded-2xl border px-5 py-3.5 text-sm max-w-md backdrop-blur-2xl",
          hasActions
            ? "bg-amber-500/[0.08] border-amber-500/20 text-amber-100"
            : isResolved
              ? "bg-white/[0.03] border-white/[0.06] text-zinc-400"
              : "bg-white/[0.04] border-white/[0.06]"
        )}>
          <p className="whitespace-pre-wrap text-xs">{message.content}</p>
          {hasActions && <TelegramAccessActions message={message} />}
          {isResolved && (
            <span className="text-xs text-zinc-500 mt-1 block">
              {meta.action === "approve" ? "✅ Approved" : "❌ Blocked"}
            </span>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn("group flex gap-3 animate-fade-in", isUser ? "justify-end" : "justify-start")}
    >
      <div
        className={cn(
          "max-w-[92%] sm:max-w-[75%] rounded-2xl px-5 py-3 text-sm",
          isUser
            ? "bg-gradient-to-br from-blue-500/15 to-purple-500/10 border border-blue-500/20 text-primary-foreground rounded-br-md backdrop-blur-2xl shadow-[0_4px_16px_rgba(59,130,246,0.1)]"
            : "bg-white/[0.04] border border-white/[0.08] rounded-bl-md backdrop-blur-2xl"
        )}
      >
        {/* File attachments */}
        {extractFileRefs(message.content).map((ref) => (
          <FileAttachment key={ref.id} id={ref.id} filename={ref.filename} />
        ))}

        {isUser ? (
          <p className="whitespace-pre-wrap">{stripFileRefs(message.content)}</p>
        ) : (
          <div className="prose prose-invert prose-sm max-w-none
            [&>*:first-child]:mt-0 [&>*:last-child]:mb-0
            prose-table:border-collapse prose-table:w-full
            prose-th:border prose-th:border-white/[0.08] prose-th:bg-white/[0.06] prose-th:px-3 prose-th:py-1.5 prose-th:text-left prose-th:text-xs prose-th:font-semibold
            prose-td:border prose-td:border-white/[0.08] prose-td:px-3 prose-td:py-1.5 prose-td:text-xs
            prose-blockquote:border-l-blue-500 prose-blockquote:bg-white/[0.04] prose-blockquote:py-1 prose-blockquote:not-italic
            prose-code:bg-white/[0.08] prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded-md prose-code:text-blue-300 prose-code:before:content-none prose-code:after:content-none
            prose-a:text-blue-400 prose-a:no-underline hover:prose-a:underline
            prose-hr:border-white/[0.08]
            prose-li:marker:text-zinc-500
            prose-strong:text-white
          ">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                code({ className, children, ...props }) {
                  const match = /language-(\w+)/.exec(className || "");
                  const content = String(children).replace(/\n$/, "");
                  if (!match && !content.includes("\n")) {
                    return <code className={className} {...props}>{children}</code>;
                  }
                  return <CodeBlock language={match?.[1]}>{content}</CodeBlock>;
                },
                pre({ children }) {
                  return <>{children}</>;
                },
                table({ children }) {
                  return (
                    <div className="my-2 overflow-x-auto rounded-xl border border-white/[0.08]">
                      <table className="w-full border-collapse text-xs">{children}</table>
                    </div>
                  );
                },
                thead({ children }) {
                  return <thead className="bg-white/[0.06]">{children}</thead>;
                },
                th({ children }) {
                  return <th className="border border-white/[0.08] px-3 py-2 text-left font-semibold text-zinc-200">{children}</th>;
                },
                td({ children }) {
                  return <td className="border border-white/[0.08] px-3 py-2 text-zinc-300">{children}</td>;
                },
              }}
            >
              {stripFileRefs(message.content)}
            </ReactMarkdown>
          </div>
        )}

        {/* Metadata on hover */}
        <div
          className={cn(
            "mt-1.5 flex items-center gap-2 text-[10px] opacity-0 transition-opacity group-hover:opacity-60",
            isUser ? "justify-end" : "justify-start"
          )}
        >
          <span>{formatRelativeTime(message._creationTime)}</span>
          {message.tokens && (
            <span>
              {formatTokens(message.tokens.input)}/{formatTokens(message.tokens.output)} tokens
            </span>
          )}
          {message.cost != null && message.cost > 0 && (
            <span>{formatCost(message.cost)}</span>
          )}
          {!isUser && message.content && (
            <ReadAloudButton text={message.content} />
          )}
        </div>
      </div>
    </div>
  );
}
