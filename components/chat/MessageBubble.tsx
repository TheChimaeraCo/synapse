"use client";
import { gatewayFetch } from "@/lib/gatewayFetch";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import { cn, formatRelativeTime, formatCost, formatTokens } from "@/lib/utils";
import type { MessageDisplay } from "@/lib/types";
import React, { useState, useRef, useMemo, useCallback, useEffect } from "react";
import { Check, Copy, Download, FileIcon, ImageIcon, Volume2, Loader2, RotateCcw, GitBranch, Star, SmilePlus } from "lucide-react";

function CodeBlock({ language, children }: { language?: string; children: string }) {
  const [copied, setCopied] = useState(false);

  const copy = () => {
    navigator.clipboard.writeText(children);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative group/code my-3 rounded-xl overflow-hidden border border-white/[0.08] shadow-[0_4px_16px_rgba(0,0,0,0.2)] max-w-[calc(100vw-4rem)] sm:max-w-none">
      <div className="flex items-center justify-between bg-white/[0.06] px-4 py-2 text-xs text-zinc-400">
        <span>{language || "text"}</span>
        <button onClick={copy} aria-label={copied ? "Copied to clipboard" : "Copy code"} className="flex items-center gap-1 hover:text-white transition-colors">
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
          overflowX: "auto" as any,
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
    <button onClick={handlePlay} className="hover:text-white transition-colors" aria-label={playing ? "Stop reading" : "Read aloud"} title={playing ? "Stop" : "Read aloud"}>
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

/**
 * Pre-process markdown to fix malformed tables.
 * Detects pipe-delimited rows missing the header separator and inserts one.
 */
function preprocessMarkdown(content: string): string {
  const lines = content.split("\n");
  const result: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    result.push(line);

    // Check if this looks like a table header row (has pipes)
    if (trimmed.startsWith("|") && trimmed.endsWith("|")) {
      const cols = trimmed.split("|").filter((c) => c.trim() !== "").length;
      if (cols > 0) {
        // Check next line - if it's NOT a separator row but IS another pipe row (or empty), inject separator
        const nextLine = i + 1 < lines.length ? lines[i + 1]?.trim() : "";
        const isSeparator = /^\|[\s\-:|]+\|$/.test(nextLine);
        const prevLine = i > 0 ? lines[i - 1]?.trim() : "";
        const prevIsPipe = prevLine.startsWith("|") && prevLine.endsWith("|");

        // Only inject if this is the FIRST pipe row (not preceded by another pipe row) and next is not a separator
        if (!isSeparator && !prevIsPipe) {
          const sep = "|" + " --- |".repeat(cols);
          result.push(sep);
        }
      }
    }
  }

  return result.join("\n");
}

/**
 * Fallback renderer for pipe-delimited text that ReactMarkdown didn't parse as a table.
 * Wraps in a styled grid.
 */
function FallbackTable({ text }: { text: string }) {
  const rows = text
    .trim()
    .split("\n")
    .filter((l) => l.trim().startsWith("|"))
    .map((l) =>
      l
        .trim()
        .replace(/^\|/, "")
        .replace(/\|$/, "")
        .split("|")
        .map((c) => c.trim())
    )
    .filter((r) => !r.every((c) => /^[\s\-:]+$/.test(c))); // skip separator rows

  if (rows.length === 0) return null;
  const cols = Math.max(...rows.map((r) => r.length));

  return (
    <div className="my-3 overflow-x-auto rounded-xl border border-white/[0.08] max-w-[calc(100vw-5rem)] sm:max-w-none">
      <div className="min-w-[300px]">
        {rows.map((row, ri) => (
          <div
            key={ri}
            className={cn(
              "grid gap-0 text-xs",
              ri === 0
                ? "bg-white/[0.08] font-semibold text-zinc-200"
                : ri % 2 === 0
                  ? "bg-white/[0.03]"
                  : "bg-transparent"
            )}
            style={{ gridTemplateColumns: `repeat(${cols}, minmax(80px, 1fr))` }}
          >
            {Array.from({ length: cols }, (_, ci) => (
              <div key={ci} className="px-3 py-2 border-b border-r border-white/[0.06] last:border-r-0 text-zinc-300">
                {row[ci] || ""}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

// Memoized markdown components to avoid re-creating on every render
const markdownComponents = {
  p({ children, ...props }: any) {
    // Check if children contain raw pipe-table text that wasn't parsed
    const text = typeof children === "string" ? children : "";
    if (text.includes("|") && text.split("\n").filter((l: string) => l.trim().startsWith("|")).length >= 2) {
      return <FallbackTable text={text} />;
    }
    return <p className="my-2 leading-relaxed" {...props}>{children}</p>;
  },
  a({ href, children, ...props }: any) {
    return <a href={href} target="_blank" rel="noopener noreferrer" {...props}>{children}</a>;
  },
  h1({ children, ...props }: any) {
    return <h1 className="text-xl font-bold text-white mt-5 mb-2.5 tracking-tight" {...props}>{children}</h1>;
  },
  h2({ children, ...props }: any) {
    return <h2 className="text-lg font-bold text-white mt-4 mb-2 tracking-tight" {...props}>{children}</h2>;
  },
  h3({ children, ...props }: any) {
    return <h3 className="text-base font-semibold text-zinc-100 mt-3.5 mb-1.5" {...props}>{children}</h3>;
  },
  h4({ children, ...props }: any) {
    return <h4 className="text-sm font-semibold text-zinc-200 mt-3 mb-1" {...props}>{children}</h4>;
  },
  ul({ children, ...props }: any) {
    return <ul className="my-2 ml-1 space-y-1 list-disc list-outside pl-4 marker:text-zinc-500" {...props}>{children}</ul>;
  },
  ol({ children, ...props }: any) {
    return <ol className="my-2 ml-1 space-y-1 list-decimal list-outside pl-4 marker:text-zinc-500" {...props}>{children}</ol>;
  },
  li({ children, ...props }: any) {
    return <li className="pl-1 leading-relaxed" {...props}>{children}</li>;
  },
  blockquote({ children, ...props }: any) {
    return <blockquote className="my-3 border-l-2 border-blue-500/60 bg-white/[0.04] rounded-r-lg pl-4 pr-3 py-2 text-zinc-300 not-italic" {...props}>{children}</blockquote>;
  },
  hr(props: any) {
    return <hr className="my-4 border-white/[0.08]" {...props} />;
  },
  em({ children, ...props }: any) {
    return <em className="text-zinc-300 italic" {...props}>{children}</em>;
  },
  strong({ children, ...props }: any) {
    return <strong className="font-semibold text-white" {...props}>{children}</strong>;
  },
  code({ className, children, ...props }: any) {
    const match = /language-(\w+)/.exec(className || "");
    const content = String(children).replace(/\n$/, "");
    if (!match && !content.includes("\n")) {
      return <code className={className} {...props}>{children}</code>;
    }
    return <CodeBlock language={match?.[1]}>{content}</CodeBlock>;
  },
  pre({ children }: any) {
    return <>{children}</>;
  },
  table({ children }: any) {
    return (
      <div className="my-3 overflow-x-auto rounded-xl border border-white/[0.08] max-w-[calc(100vw-5rem)] sm:max-w-none">
        <table className="w-full border-collapse text-xs min-w-[300px]">{children}</table>
      </div>
    );
  },
  thead({ children }: any) {
    return <thead className="bg-white/[0.08]">{children}</thead>;
  },
  th({ children }: any) {
    return <th className="border-b border-r border-white/[0.06] last:border-r-0 px-3 py-2.5 text-left font-semibold text-zinc-200 text-xs">{children}</th>;
  },
  tr({ children, ...props }: any) {
    return <tr className="even:bg-white/[0.03] transition-colors hover:bg-white/[0.06]" {...props}>{children}</tr>;
  },
  td({ children }: any) {
    return <td className="border-b border-r border-white/[0.06] last:border-r-0 px-3 py-2 text-zinc-300">{children}</td>;
  },
};

const remarkPlugins = [remarkGfm];

const REACTION_EMOJIS = ["👍", "👎", "❤️", "🎯", "💡"];

interface ReactionCount {
  emoji: string;
  count: number;
  reacted: boolean; // whether current user has reacted
}

function ReactionBar({ messageId, reactions, onReact }: { messageId: string; reactions: ReactionCount[]; onReact: (emoji: string) => void }) {
  const [showPicker, setShowPicker] = useState(false);

  return (
    <div className="inline-flex items-center gap-1 flex-wrap">
      {reactions.filter(r => r.count > 0).map(r => (
        <button
          key={r.emoji}
          onClick={() => onReact(r.emoji)}
          className={cn(
            "flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[11px] transition-colors border",
            r.reacted
              ? "bg-blue-500/15 border-blue-500/30 text-blue-300"
              : "bg-white/[0.04] border-white/[0.08] text-zinc-400 hover:bg-white/[0.08]"
          )}
        >
          <span>{r.emoji}</span>
          <span className="font-mono text-[10px]">{r.count}</span>
        </button>
      ))}
      <div className="relative">
        <button
          onClick={() => setShowPicker(v => !v)}
          className="p-1 rounded-full text-zinc-600 hover:text-zinc-300 hover:bg-white/[0.06] transition-colors"
          aria-label="Add reaction"
        >
          <SmilePlus className="h-3.5 w-3.5" />
        </button>
        {showPicker && (
          <div className="absolute bottom-full left-0 mb-1 flex gap-0.5 px-2 py-1.5 rounded-xl bg-white/[0.07] backdrop-blur-xl border border-white/[0.12] shadow-lg z-10">
            {REACTION_EMOJIS.map(emoji => (
              <button
                key={emoji}
                onClick={() => { onReact(emoji); setShowPicker(false); }}
                className="p-1 rounded-lg hover:bg-white/[0.1] transition-colors text-sm"
              >
                {emoji}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export const MessageBubble = React.memo(function MessageBubble({ message, onRetry, onBranch, onPin, isPinned }: { message: MessageDisplay; onRetry?: (messageId: string) => void; onBranch?: (messageId: string) => void; onPin?: (messageId: string) => void; isPinned?: boolean }) {
  const isUser = message.role === "user";
  const isSystem = message.role === "system";
  const isFailed = message.content?.startsWith("Error:");
  const [reactions, setReactions] = useState<ReactionCount[]>([]);
  const [copiedMsg, setCopiedMsg] = useState(false);

  const copyMessage = useCallback(() => {
    navigator.clipboard.writeText(stripFileRefs(message.content));
    setCopiedMsg(true);
    setTimeout(() => setCopiedMsg(false), 1500);
  }, [message.content]);

  // Fetch reactions for assistant messages
  useEffect(() => {
    if (isUser || isSystem) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await gatewayFetch(`/api/reactions?messageId=${message._id}`);
        if (res.ok && !cancelled) {
          const data = await res.json();
          const rawReactions = data.reactions || [];
          // Aggregate by emoji
          const counts = new Map<string, { count: number; reacted: boolean }>();
          for (const r of rawReactions) {
            const existing = counts.get(r.emoji) || { count: 0, reacted: false };
            existing.count++;
            counts.set(r.emoji, existing);
          }
          setReactions(REACTION_EMOJIS.map(emoji => ({
            emoji,
            count: counts.get(emoji)?.count || 0,
            reacted: counts.get(emoji)?.reacted || false,
          })));
        }
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [message._id, isUser, isSystem]);

  const handleReact = useCallback(async (emoji: string) => {
    try {
      const res = await gatewayFetch("/api/reactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messageId: message._id, emoji }),
      });
      if (res.ok) {
        const data = await res.json();
        setReactions(prev => prev.map(r =>
          r.emoji === emoji
            ? { ...r, count: data.action === "added" ? r.count + 1 : Math.max(0, r.count - 1), reacted: data.action === "added" }
            : r
        ));
      }
    } catch {}
  }, [message._id]);

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
    <article
      className={cn("group flex gap-3 animate-fade-in", isUser ? "justify-end" : "justify-start")}
      aria-label={`${isUser ? "Your" : "Assistant"} message`}
    >
      <div
        className={cn(
          "max-w-[92%] sm:max-w-[75%] rounded-2xl px-5 pt-3 pb-2.5 text-sm",
          isUser
            ? "bg-gradient-to-br from-blue-500/15 to-purple-500/10 border border-blue-500/20 text-primary-foreground rounded-br-md backdrop-blur-2xl shadow-[0_4px_16px_rgba(59,130,246,0.1)]"
            : "bg-gradient-to-br from-white/[0.06] to-white/[0.03] border border-white/[0.1] rounded-bl-md backdrop-blur-2xl shadow-[0_4px_16px_rgba(0,0,0,0.1)]"
        )}
      >
        {/* File attachments */}
        {extractFileRefs(message.content).map((ref) => (
          <FileAttachment key={ref.id} id={ref.id} filename={ref.filename} />
        ))}

        {isUser ? (
          <p className="whitespace-pre-wrap">{stripFileRefs(message.content)}</p>
        ) : (
          <div className="prose prose-invert prose-sm max-w-none break-words overflow-hidden leading-relaxed
            [&>*:first-child]:mt-0 [&>*:last-child]:mb-0
            prose-code:bg-white/[0.08] prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded-md prose-code:text-blue-300 prose-code:text-[0.8em] prose-code:font-mono prose-code:before:content-none prose-code:after:content-none
            prose-a:text-blue-400 prose-a:no-underline hover:prose-a:underline
            [&_emoji]:text-lg
          ">
            <ReactMarkdown
              remarkPlugins={remarkPlugins}
              components={markdownComponents}
            >
              {preprocessMarkdown(stripFileRefs(message.content))}
            </ReactMarkdown>
          </div>
        )}

        {/* Retry button for failed messages */}
        {isFailed && !isUser && onRetry && (
          <button
            onClick={() => onRetry(message._id)}
            className="mt-2 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-red-500/10 border border-red-500/20 text-red-400 hover:bg-red-500/20 hover:text-red-300 transition-colors"
          >
            <RotateCcw className="h-3 w-3" />
            Retry
          </button>
        )}

        {/* Message metadata & actions - always visible */}
        <div className={cn(
          "mt-1.5 flex items-center gap-1.5 text-[10px] text-zinc-500",
          isUser ? "justify-end" : "justify-start"
        )}>
          <button
            onClick={copyMessage}
            className="hover:text-white transition-colors relative"
            aria-label="Copy message"
            title={copiedMsg ? "Copied!" : "Copy message"}
          >
            {copiedMsg ? <Check className="h-3 w-3 text-green-400" /> : <Copy className="h-3 w-3" />}
          </button>
          <span>{formatRelativeTime(message._creationTime)}</span>
          {!isUser && (message as any).model && (
            <>
              <span className="text-zinc-600">·</span>
              <span className="text-zinc-500/80">{(message as any).model}</span>
            </>
          )}
          {message.tokens && (
            <>
              <span className="text-zinc-600">·</span>
              <span>{formatTokens(message.tokens.input)}/{formatTokens(message.tokens.output)} tokens</span>
            </>
          )}
          {message.cost != null && message.cost > 0 && (
            <>
              <span className="text-zinc-600">·</span>
              <span>{formatCost(message.cost)}</span>
            </>
          )}
          {!isUser && message.content && (
            <ReadAloudButton text={message.content} />
          )}
          {onPin && (
            <button
              onClick={() => onPin(message._id)}
              className={`hover:text-white transition-colors ${isPinned ? "text-yellow-400" : ""}`}
              aria-label={isPinned ? "Unpin message" : "Pin message"}
              title={isPinned ? "Unpin" : "Pin message"}
            >
              <Star className={`h-3 w-3 ${isPinned ? "fill-yellow-400" : ""}`} />
            </button>
          )}
          {onBranch && (
            <button
              onClick={() => onBranch(message._id)}
              className="hover:text-white transition-colors"
              aria-label="Branch from here"
              title="Branch from here"
            >
              <GitBranch className="h-3 w-3" />
            </button>
          )}
          {!isUser && (
            <ReactionBar messageId={message._id} reactions={reactions} onReact={handleReact} />
          )}
        </div>
      </div>
    </article>
  );
});
