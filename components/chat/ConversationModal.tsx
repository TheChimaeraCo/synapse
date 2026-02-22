"use client";
import { gatewayFetch } from "@/lib/gatewayFetch";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X, MessageSquare, Tag, Pin, Clock, ChevronRight, Link2, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface ConversationData {
  _id: string;
  title?: string;
  summary?: string;
  topics?: string[];
  decisions?: Array<{ what: string; reasoning?: string }>;
  stateUpdates?: Array<{ domain: string; attribute: string; value: string; supersedes?: string }>;
  status: string;
  messageCount: number;
  firstMessageAt: number;
  lastMessageAt: number;
  closedAt?: number;
  previousConvoId?: string;
  depth: number;
}

interface Message {
  _id: string;
  role: string;
  content: string;
  _creationTime: number;
}

interface ConversationFile {
  _id: string;
  filename: string;
  mimeType: string;
  size: number;
  conversationId?: string;
  messageId?: string;
  createdAt: number;
  url?: string;
}

interface Props {
  conversationId: string;
  onClose: () => void;
  onContinue?: (convoId: string, title: string) => void;
}

function formatDateTime(ts: number): string {
  return new Date(ts).toLocaleString("en-US", {
    month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
  });
}

function formatDuration(start: number, end: number): string {
  const mins = Math.round((end - start) / 60000);
  if (mins < 1) return "< 1 min";
  if (mins < 60) return `${mins} min`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ${mins % 60}m`;
}

export function ConversationModal({ conversationId, onClose, onContinue }: Props) {
  const [convo, setConvo] = useState<ConversationData | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [files, setFiles] = useState<ConversationFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [showMessages, setShowMessages] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const [convoRes, msgsRes, filesRes] = await Promise.all([
          gatewayFetch(`/api/conversations/${conversationId}`),
          gatewayFetch(`/api/conversations/${conversationId}/messages`),
          gatewayFetch(`/api/conversations/${conversationId}/files?includeChain=true`),
        ]);
        if (convoRes.ok) {
          const data = await convoRes.json();
          setConvo(data.conversation);
        }
        if (msgsRes.ok) {
          const data = await msgsRes.json();
          setMessages(data.messages || []);
        }
        if (filesRes.ok) {
          const data = await filesRes.json();
          setFiles(data.files || []);
        }
      } catch {}
      setLoading(false);
    };
    fetchData();
  }, [conversationId]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  const content = (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="convo-modal-title"
        className="relative w-full max-w-2xl max-h-[85vh] overflow-hidden rounded-2xl border border-white/10 bg-[#0d0d1a]/95 backdrop-blur-xl shadow-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-white/10 shrink-0">
          <div className="flex-1 min-w-0">
            <h2 id="convo-modal-title" className="text-lg font-semibold text-zinc-100 truncate">
              {loading ? "Loading..." : convo?.title || "Untitled Conversation"}
            </h2>
            {convo && (
              <div className="flex items-center gap-3 mt-1 text-xs text-zinc-500">
                <span className={cn(
                  "px-2 py-0.5 rounded-full text-[10px] font-medium",
                  convo.status === "active"
                    ? "bg-blue-500/20 text-blue-300"
                    : "bg-white/[0.08] text-zinc-400"
                )}>
                  {convo.status}
                </span>
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {formatDateTime(convo.firstMessageAt)}
                </span>
                <span className="flex items-center gap-1">
                  <MessageSquare className="h-3 w-3" />
                  {convo.messageCount} messages
                </span>
                {convo.closedAt && (
                  <span>{formatDuration(convo.firstMessageAt, convo.closedAt)}</span>
                )}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => {
                const el = document.getElementById(`convo-${conversationId}`);
                if (el) {
                  el.scrollIntoView({ behavior: "smooth", block: "start" });
                }
                onClose();
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 border border-white/10 text-zinc-300 text-xs font-medium transition"
            >
              <ArrowRight className="h-3.5 w-3.5" />
              Go to conversation
            </button>
            {onContinue && convo && convo.status === "closed" && (
              <button
                onClick={() => {
                  onContinue(conversationId, convo.title || "Untitled");
                  setTimeout(onClose, 100);
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-500/20 hover:bg-blue-500/30 border border-blue-500/30 text-blue-300 text-xs font-medium transition"
              >
                <Link2 className="h-3.5 w-3.5" />
                Continue this conversation
              </button>
            )}
            <button
              onClick={onClose}
              aria-label="Close dialog"
              className="p-2 rounded-lg hover:bg-white/10 transition text-zinc-400 hover:text-zinc-200"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {loading ? (
            <div className="text-center text-zinc-500 py-12">Loading conversation...</div>
          ) : (
            <>
              {/* Summary */}
              {convo?.summary && (
                <div className="glass rounded-xl p-4">
                  <h3 className="text-xs font-medium text-zinc-400 uppercase tracking-wider mb-2">Summary</h3>
                  <p className="text-sm text-zinc-300 leading-relaxed">{convo.summary}</p>
                </div>
              )}

              {/* Topics */}
              {convo?.topics && convo.topics.length > 0 && (
                <div>
                  <h3 className="text-xs font-medium text-zinc-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <Tag className="h-3 w-3" /> Topics
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {convo.topics.map((t, i) => (
                      <span key={i} className="bg-purple-500/15 text-purple-300 px-3 py-1 rounded-full text-xs font-medium">
                        {t}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Decisions */}
              {convo?.decisions && convo.decisions.length > 0 && (
                <div>
                  <h3 className="text-xs font-medium text-zinc-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <Pin className="h-3 w-3" /> Decisions
                  </h3>
                  <div className="space-y-2">
                    {convo.decisions.map((d, i) => (
                      <div key={i} className="glass rounded-lg p-3">
                        <p className="text-sm text-blue-300 font-medium">{d.what}</p>
                        {d.reasoning && (
                          <p className="text-xs text-zinc-500 mt-1">{d.reasoning}</p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {convo?.stateUpdates && convo.stateUpdates.length > 0 && (
                <div>
                  <h3 className="text-xs font-medium text-zinc-400 uppercase tracking-wider mb-2">Thread State Updates</h3>
                  <div className="space-y-2">
                    {convo.stateUpdates.map((s, i) => (
                      <div key={`${s.domain}-${s.attribute}-${i}`} className="glass rounded-lg p-3">
                        <p className="text-xs text-zinc-500 uppercase tracking-wide mb-0.5">{s.domain}</p>
                        <p className="text-sm text-zinc-200">
                          <span className="text-zinc-400">{s.attribute}:</span> {s.value}
                        </p>
                        {s.supersedes && (
                          <p className="text-[11px] text-zinc-500 mt-1">Supersedes: {s.supersedes}</p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Messages toggle */}
              <div>
                <button
                  onClick={() => setShowMessages(!showMessages)}
                  className="flex items-center gap-2 text-xs font-medium text-zinc-400 uppercase tracking-wider hover:text-zinc-300 transition"
                >
                  <ChevronRight className={cn("h-3 w-3 transition-transform", showMessages && "rotate-90")} />
                  <MessageSquare className="h-3 w-3" />
                  Messages ({messages.length})
                </button>

                {showMessages && (
                  <div className="mt-3 space-y-2">
                    {messages.length === 0 ? (
                      <p className="text-xs text-zinc-600 italic">No messages found for this conversation.</p>
                    ) : (
                      messages.map((msg) => (
                        <div
                          key={msg._id}
                          className={cn(
                            "rounded-lg p-3 text-sm",
                            msg.role === "user"
                              ? "bg-blue-500/10 border border-blue-500/20 ml-8"
                              : "bg-white/5 border border-white/5 mr-8"
                          )}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span className={cn(
                              "text-[10px] font-medium uppercase",
                              msg.role === "user" ? "text-blue-400" : "text-zinc-500"
                            )}>
                              {msg.role}
                            </span>
                            <span className="text-[10px] text-zinc-600">
                              {new Date(msg._creationTime).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                            </span>
                          </div>
                          <p className="text-zinc-300 whitespace-pre-wrap leading-relaxed">
                            {msg.content?.slice(0, 500)}{msg.content?.length > 500 ? "..." : ""}
                          </p>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>

              {files.length > 0 && (
                <div>
                  <h3 className="text-xs font-medium text-zinc-400 uppercase tracking-wider mb-2">
                    Linked Files ({files.length})
                  </h3>
                  <div className="space-y-2">
                    {files.slice(0, 20).map((file) => (
                      <a
                        key={file._id}
                        href={`/api/files/${file._id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center justify-between rounded-lg border border-white/10 bg-white/5 px-3 py-2 hover:bg-white/10 transition"
                      >
                        <div>
                          <p className="text-sm text-zinc-200">{file.filename}</p>
                          <p className="text-[11px] text-zinc-500">
                            {file.mimeType} • {(file.size / 1024).toFixed(0)} KB • {formatDateTime(file.createdAt)}
                          </p>
                        </div>
                        <span className="text-xs text-blue-300">Open</span>
                      </a>
                    ))}
                  </div>
                </div>
              )}

              {/* Empty state */}
              {!convo?.summary && (!convo?.topics || convo.topics.length === 0) && (!convo?.decisions || convo.decisions.length === 0) && (!convo?.stateUpdates || convo.stateUpdates.length === 0) && messages.length === 0 && files.length === 0 && (
                <div className="text-center text-zinc-600 py-8">
                  <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">This conversation hasn't been summarized yet.</p>
                  <p className="text-xs mt-1">Summaries are generated when conversations close.</p>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );

  if (typeof window === "undefined") return null;
  return createPortal(content, document.body);
}
