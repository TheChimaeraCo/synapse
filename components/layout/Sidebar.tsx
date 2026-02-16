"use client";
import { gatewayFetch } from "@/lib/gatewayFetch";

import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Bot,
  Brain,
  CheckCircle2,
  FileText,
  FolderKanban,
  FolderOpen,
  Globe,
  Hash,
  LayoutDashboard,
  Loader2,
  MessageCircle,
  MessageSquare,
  Plus,
  Send as SendIcon,
  Settings,
  Square,
  X,
  XCircle,
  Zap,
ArrowRight,
} from "lucide-react";
import { useSession } from "next-auth/react";
import { ConversationModal } from "@/components/chat/ConversationModal";
import { ConnectionStatus } from "@/components/ui/ConnectionStatus";
import { GatewaySwitcher } from "@/components/layout/GatewaySwitcher";
import { useTheme } from "@/contexts/ThemeContext";
import { ChevronDown, Download, Sun, Moon } from "lucide-react";

interface WorkerAgent {
  _id: string;
  label: string;
  task?: string;
  status: string;
  model?: string;
  startedAt: number;
  completedAt?: number;
  tokens?: { input: number; output: number };
  cost?: number;
  result?: string;
  error?: string;
  logs?: string[];
}

function InstallAppButton() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    if (window.matchMedia("(display-mode: standalone)").matches) {
      setIsInstalled(true);
      return;
    }
    const handler = (e: Event) => { e.preventDefault(); setDeferredPrompt(e); };
    window.addEventListener("beforeinstallprompt", handler);
    window.addEventListener("appinstalled", () => setIsInstalled(true));
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  if (isInstalled) return null;

  const handleClick = async () => {
    if (deferredPrompt) {
      await deferredPrompt.prompt();
      setDeferredPrompt(null);
    } else {
      // Fallback: show instructions
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
      if (isIOS) {
        alert("Tap the Share button, then 'Add to Home Screen'");
      } else {
        alert("Click the install icon in your browser's address bar, or use the browser menu → 'Install app'");
      }
    }
  };

  return (
    <button
      onClick={handleClick}
      className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.08] transition-all border border-white/[0.08] bg-white/[0.04]"
    >
      <Download className="h-3.5 w-3.5" />
      Install App
    </button>
  );
}

const navLinks = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/chat", label: "Chat", icon: MessageSquare },
  { href: "/knowledge", label: "Knowledge", icon: Brain },
  { href: "/files", label: "Files", icon: FolderOpen },
  { href: "/projects", label: "Projects", icon: FolderKanban },
  { href: "/analytics", label: "Analytics", icon: Zap },
  { href: "/docs", label: "API Docs", icon: FileText },
  { href: "/settings", label: "Settings", icon: Settings },
];

function formatElapsed(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(0)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

function formatTokens(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

function AgentLogModal({ agent, onClose }: { agent: WorkerAgent; onClose: () => void }) {
  const [logs, setLogs] = useState<string[]>(agent.logs || []);

  // Poll for new logs if running
  useEffect(() => {
    if (agent.status !== "running") return;
    const interval = setInterval(async () => {
      try {
        const res = await gatewayFetch(`/api/agents/workers/${agent._id}/logs`);
        if (res.ok) {
          const data = await res.json();
          setLogs(data.logs || []);
        }
      } catch {}
    }, 2000);
    return () => clearInterval(interval);
  }, [agent._id, agent.status]);

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="agent-log-title"
        className="bg-white/5 backdrop-blur-2xl border border-white/10 rounded-2xl w-full max-w-2xl max-h-[80vh] flex flex-col glass-shadow"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
          <div>
            <h3 id="agent-log-title" className="text-sm font-medium text-zinc-200">{agent.label}</h3>
            {agent.task && <p className="text-xs text-zinc-500 mt-0.5 truncate max-w-md">{agent.task}</p>}
          </div>
          <button onClick={onClose} aria-label="Close agent logs" className="text-zinc-500 hover:text-zinc-300">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-1 font-mono text-[11px]">
          {logs.length === 0 && <p className="text-zinc-600 italic">No logs yet...</p>}
          {logs.map((log, i) => (
            <div key={i} className={cn(
              "py-0.5",
              log.includes("failed") || log.includes("Error") ? "text-red-400" :
              log.includes("succeeded") || log.includes("Completed") ? "text-green-400" :
              log.includes("Tool call") ? "text-blue-400" :
              "text-zinc-400"
            )}>
              {log}
            </div>
          ))}
          {agent.status === "running" && (
            <div className="flex items-center gap-2 text-blue-400 pt-2">
              <Loader2 className="h-3 w-3 animate-spin" />
              <span>Running...</span>
            </div>
          )}
        </div>

        {agent.result && (
          <div className="border-t border-white/10 p-4">
            <p className="text-[10px] text-zinc-500 uppercase tracking-wider mb-1">Result</p>
            <p className="text-xs text-zinc-300 whitespace-pre-wrap max-h-40 overflow-y-auto">{agent.result}</p>
          </div>
        )}

        {agent.error && (
          <div className="border-t border-white/10 p-4">
            <p className="text-[10px] text-red-500 uppercase tracking-wider mb-1">Error</p>
            <p className="text-xs text-red-400 cursor-pointer" onClick={() => navigator.clipboard.writeText(agent.error!)}>{agent.error}</p>
          </div>
        )}

        <div className="border-t border-white/10 px-4 py-2 flex items-center gap-4 text-[10px] text-zinc-500 font-mono">
          <span>Status: {agent.status}</span>
          {agent.tokens && <span>{formatTokens(agent.tokens.input + agent.tokens.output)} tokens</span>}
          {agent.cost !== undefined && <span>${agent.cost.toFixed(4)}</span>}
          <span>{agent.model}</span>
        </div>
      </div>
    </div>
  );
}

function AgentItem({ agent, onKill }: { agent: WorkerAgent; onKill?: (id: string) => void }) {
  const [now, setNow] = useState(Date.now());
  const [showLogs, setShowLogs] = useState(false);
  const isRunning = agent.status === "running";
  const isFailed = agent.status === "failed";

  useEffect(() => {
    if (!isRunning) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [isRunning]);

  const elapsed = (agent.completedAt || now) - agent.startedAt;
  const totalTokens = agent.tokens ? agent.tokens.input + agent.tokens.output : 0;

  return (
    <>
      <div
        className={cn(
          "rounded-md px-2.5 py-2 text-xs space-y-1 border-l-2 cursor-pointer hover:brightness-125 transition",
          isRunning ? "border-blue-500 bg-blue-500/5" :
          isFailed ? "border-red-500 bg-red-500/5" :
          "border-green-500 bg-green-500/5"
        )}
        onClick={() => setShowLogs(true)}
      >
        <div className="flex items-center gap-1.5">
          {isRunning ? (
            <span className="relative flex h-2 w-2 shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500" />
            </span>
          ) : isFailed ? (
            <XCircle className="h-3 w-3 text-red-500 shrink-0" />
          ) : (
            <CheckCircle2 className="h-3 w-3 text-green-500 shrink-0" />
          )}
          <span className="font-medium text-zinc-300 truncate flex-1">{agent.label}</span>
          {isRunning && onKill && (
            <button
              onClick={(e) => { e.stopPropagation(); onKill(agent._id); }}
              className="p-0.5 rounded hover:bg-red-500/20 text-zinc-500 hover:text-red-400 transition-colors shrink-0"
              aria-label="Kill agent"
              title="Kill agent"
            >
              <Square className="h-2.5 w-2.5 fill-current" />
            </button>
          )}
        </div>
        {agent.task && (
          <p className="text-[10px] text-zinc-500 truncate pl-3.5" title={agent.task}>
            {agent.task}
          </p>
        )}
        <div className="flex items-center gap-2 pl-3.5 text-[10px] text-zinc-500 font-mono">
          <span>{formatElapsed(elapsed)}</span>
          {totalTokens > 0 && <span>{formatTokens(totalTokens)}t</span>}
          {agent.cost !== undefined && agent.cost > 0 && <span>${agent.cost.toFixed(3)}</span>}
        </div>
        {isFailed && agent.error && (
          <p className="text-[10px] text-red-400 truncate pl-3.5">{agent.error}</p>
        )}
      </div>
      {showLogs && typeof document !== "undefined" && createPortal(
        <AgentLogModal agent={agent} onClose={() => setShowLogs(false)} />,
        document.body
      )}
    </>
  );
}

function SidebarAgents() {
  const [agents, setAgents] = useState<WorkerAgent[]>([]);

  const fetchAgents = useCallback(async () => {
    try {
      const res = await gatewayFetch("/api/agents/active");
      if (res.ok) {
        const data = await res.json();
        setAgents(data.agents || []);
      }
    } catch {}
  }, []);

  const killAgent = useCallback(async (id: string) => {
    try {
      await gatewayFetch(`/api/agents/workers/${id}`, {
        method: "DELETE",
      });
      fetchAgents();
    } catch {}
  }, [fetchAgents]);

  useEffect(() => {
    fetchAgents();
    const hasRunning = agents.some(a => a.status === "running");
    const interval = setInterval(fetchAgents, hasRunning ? 2000 : 15000);
    return () => clearInterval(interval);
  }, [fetchAgents, agents.length]);

  useEffect(() => {
    const handler = () => fetchAgents();
    window.addEventListener("synapse:agent_update", handler);
    return () => window.removeEventListener("synapse:agent_update", handler);
  }, [fetchAgents]);

  const running = agents.filter(a => a.status === "running");
  const past = agents.filter(a => a.status !== "running");
  const [showHistory, setShowHistory] = useState(false);

  if (running.length === 0 && past.length === 0) return null;

  function sectionStats(list: WorkerAgent[]) {
    let tokens = 0, cost = 0;
    for (const a of list) {
      if (a.tokens) tokens += a.tokens.input + a.tokens.output;
      if (a.cost) cost += a.cost;
    }
    return { tokens, cost };
  }

  const activeStats = sectionStats(running);
  const historyStats = sectionStats(past);

  return (
    <div className="px-2 py-2 space-y-3">
      {/* Active agents */}
      {running.length > 0 && (
        <div>
          <div className="flex items-center gap-1.5 px-1 mb-1">
            <Bot className="h-3.5 w-3.5 text-blue-400" />
            <span className="text-[11px] font-medium text-blue-400 uppercase tracking-wider">Active</span>
            <Badge variant="outline" className="text-[9px] px-1 py-0 h-3.5 text-blue-400 border-blue-500/30 ml-auto">
              {running.length}
            </Badge>
          </div>
          {activeStats.tokens > 0 && (
            <div className="px-1 mb-2 text-[10px] text-zinc-600 font-mono">
              {formatTokens(activeStats.tokens)}t{activeStats.cost > 0 ? ` · $${activeStats.cost.toFixed(3)}` : ""}
            </div>
          )}
          <div className="space-y-1.5">
            {running.map(a => <AgentItem key={a._id} agent={a} onKill={killAgent} />)}
          </div>
        </div>
      )}

      {/* History toggle */}
      {past.length > 0 && (
        <div>
          <button
            onClick={() => setShowHistory(v => !v)}
            className="flex items-center gap-1.5 px-1 mb-1 w-full text-left hover:text-zinc-300 transition-colors"
          >
            <Bot className="h-3.5 w-3.5 text-zinc-500" />
            <span className="text-[11px] font-medium text-zinc-500 uppercase tracking-wider">History</span>
            <span className="text-[10px] text-zinc-600 ml-auto">{past.length}</span>
          </button>
          <div className="px-1 mb-2 text-[10px] text-zinc-600 font-mono">
            {formatTokens(historyStats.tokens)}t{historyStats.cost > 0 ? ` · $${historyStats.cost.toFixed(3)}` : ""}
          </div>
          {showHistory && (
            <div className="space-y-1.5">
              {past.map(a => <AgentItem key={a._id} agent={a} />)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface Conversation {
  _id: string;
  title?: string;
  summary?: string;
  topics?: string[];
  decisions?: Array<{ what: string; reasoning?: string; supersedes?: string }>;
  status: string;
  previousConvoId?: string;
  depth: number;
  messageCount: number;
  firstMessageAt: number;
  lastMessageAt: number;
  closedAt?: number;
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function SidebarConversations() {
  const { data: session } = useSession();
  const gatewayId = (session?.user as any)?.gatewayId;
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [expanded, setExpanded] = useState(true);
  const [selectedConvoId, setSelectedConvoId] = useState<string | null>(null);

  useEffect(() => {
    if (!gatewayId) return;
    const fetchConvos = async () => {
      try {
        const res = await gatewayFetch("/api/conversations?limit=30");
        if (res.ok) {
          const data = await res.json();
          setConversations(data.conversations || []);
        }
      } catch {}
    };
    fetchConvos();
    const interval = setInterval(fetchConvos, 15000);
    return () => clearInterval(interval);
  }, [gatewayId]);

  if (conversations.length === 0) return null;

  // Group by chain: root conversations and their children
  const roots: Conversation[] = [];
  const children = new Map<string, Conversation[]>();
  for (const c of conversations) {
    if (c.previousConvoId) {
      const list = children.get(c.previousConvoId) || [];
      list.push(c);
      children.set(c.previousConvoId, list);
    } else {
      roots.push(c);
    }
  }

  const scrollToConvo = (id: string) => {
    const el = document.getElementById(`convo-${id}`);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  const renderConvo = (c: Conversation, indent: boolean = false) => (
    <div
      key={c._id}
      className={cn(
        "rounded-md px-2.5 py-2 text-xs cursor-pointer hover:bg-white/5 transition",
        indent && "ml-3 border-l border-white/10 pl-3"
      )}
      onClick={() => {
        // Primary click: open modal for quick reference
        setSelectedConvoId(c._id);
      }}
    >
      <div className="flex items-center gap-1.5">
        <span
          className={cn(
            "h-2 w-2 rounded-full shrink-0",
            c.status === "active" ? "bg-blue-500" : "bg-white/[0.10]"
          )}
        />
        <span className="text-zinc-300 truncate flex-1 font-medium">
          {c.previousConvoId && <span className="text-purple-400 mr-1">🔗</span>}
          {c.title || "Untitled"}
        </span>
        <button
          onClick={(e) => { 
            e.stopPropagation(); 
            const el = document.getElementById(`convo-${c._id}`);
            if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
          }}
          className="p-0.5 rounded hover:bg-white/10 text-zinc-600 hover:text-zinc-300 transition-colors shrink-0"
          title="Go to conversation"
        >
          <ArrowRight className="h-3 w-3" />
        </button>
        <span className="text-zinc-600 text-[10px] shrink-0">{c.messageCount}</span>
      </div>
      <div className="text-[10px] text-zinc-600 mt-0.5 pl-3.5">
        {formatTime(c.firstMessageAt)} - {c.status === "active" ? "now" : formatTime(c.lastMessageAt)}
      </div>
      {c.topics && c.topics.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1 pl-3.5">
          {c.topics.slice(0, 3).map((t, i) => (
            <span key={i} className="bg-white/10 text-gray-400 px-1.5 py-0 rounded-full text-[10px]">
              {t}
            </span>
          ))}
        </div>
      )}
      {c.status === "closed" && c.decisions && c.decisions.length > 0 && (
        <div className="text-[10px] text-blue-400/70 mt-1 pl-3.5 truncate">
          📌 {c.decisions[0].what}
        </div>
      )}
    </div>
  );

  return (
    <div className="px-2 py-2 space-y-1">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex items-center gap-1.5 px-1 mb-1 w-full text-left hover:text-zinc-300 transition-colors"
      >
        <MessageCircle className="h-3.5 w-3.5 text-zinc-500" />
        <span className="text-[11px] font-medium text-zinc-500 uppercase tracking-wider">
          Conversations
        </span>
        <span className="text-[10px] text-zinc-600 ml-auto">{conversations.length}</span>
      </button>
      {expanded && (
        <div className="space-y-0.5">
          {roots.map((root) => (
            <div key={root._id}>
              {renderConvo(root)}
              {children.get(root._id)?.map((child) => renderConvo(child, true))}
            </div>
          ))}
          {/* Orphaned children (parent not in current list) */}
          {conversations
            .filter((c) => c.previousConvoId && !roots.find((r) => r._id === c.previousConvoId))
            .filter((c) => !Array.from(children.values()).flat().includes(c))
            .map((c) => renderConvo(c, true))}
        </div>
      )}
      {selectedConvoId && (
        <ConversationModal
          conversationId={selectedConvoId}
          onClose={() => setSelectedConvoId(null)}
          onContinue={(convoId, title) => {
            // Pre-fill chat input immediately
            window.dispatchEvent(new CustomEvent("synapse:continue-convo", {
              detail: { convoId, title }
            }));

            // Link conversations in the background
            gatewayFetch("/api/sessions/recent")
              .then(r => r.json())
              .then(data => {
                if (data.sessionId) {
                  gatewayFetch("/api/conversations/link", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ sessionId: data.sessionId, targetConvoId: convoId }),
                  }).catch(console.error);
                }
              })
              .catch(console.error);
          }}
        />
      )}
    </div>
  );
}

function SidebarChannels() {
  const { data: session } = useSession();
  const gatewayId = (session?.user as any)?.gatewayId;
  const [channels, setChannels] = useState<Array<{ _id: string; name: string; platform: string; icon?: string; description?: string }>>([]);
  const [activeChannelId, setActiveChannelId] = useState<string | null>(null);

  useEffect(() => {
    if (!gatewayId) return;
    const fetchChannels = async () => {
      try {
        const res = await gatewayFetch("/api/channels");
        if (res.ok) {
          const data = await res.json();
          setChannels(data);
        }
      } catch {}
    };
    fetchChannels();
    const interval = setInterval(fetchChannels, 15000);
    return () => clearInterval(interval);
  }, [gatewayId]);

  // Listen for active channel updates from chat page
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.channelId) setActiveChannelId(detail.channelId);
    };
    window.addEventListener("synapse:active-channel", handler);
    return () => window.removeEventListener("synapse:active-channel", handler);
  }, []);

  const platformChannels = channels.filter((c) => c.platform !== "custom");
  const customChannels = channels.filter((c) => c.platform === "custom");

  const PLATFORM_ICONS: Record<string, React.ReactNode> = {
    telegram: <SendIcon className="h-3.5 w-3.5 text-sky-400" />,
    hub: <Globe className="h-3.5 w-3.5 text-emerald-400" />,
    discord: <MessageCircle className="h-3.5 w-3.5 text-indigo-400" />,
    whatsapp: <MessageCircle className="h-3.5 w-3.5 text-green-400" />,
    custom: <Hash className="h-3.5 w-3.5 text-zinc-400" />,
  };

  const selectChannel = (channelId: string) => {
    setActiveChannelId(channelId);
    window.dispatchEvent(new CustomEvent("synapse:select-channel", { detail: { channelId } }));
  };

  if (channels.length === 0) return null;

  return (
    <div className="px-2 py-2 space-y-1">
      {platformChannels.length > 0 && (
        <div>
          <div className="px-1 py-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Platforms</span>
          </div>
          {platformChannels.map((ch) => (
            <button
              key={ch._id}
              onClick={() => selectChannel(ch._id)}
              className={cn(
                "w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm transition-all duration-200",
                ch._id === activeChannelId
                  ? "bg-gradient-to-r from-blue-500/10 to-purple-500/10 text-zinc-100 border border-blue-500/15"
                  : "text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.06]"
              )}
            >
              <span className="shrink-0">
                {ch.icon ? <span className="text-sm">{ch.icon}</span> : (PLATFORM_ICONS[ch.platform] || <Hash className="h-3.5 w-3.5" />)}
              </span>
              <span className="truncate">{ch.name}</span>
            </button>
          ))}
        </div>
      )}
      <div>
        <div className="px-1 py-1 flex items-center justify-between">
          <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Custom</span>
          <button
            onClick={() => window.dispatchEvent(new CustomEvent("synapse:create-channel"))}
            className="text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>
        {customChannels.map((ch) => (
          <button
            key={ch._id}
            onClick={() => selectChannel(ch._id)}
            className={cn(
              "w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm transition-all duration-200",
              ch._id === activeChannelId
                ? "bg-gradient-to-r from-blue-500/10 to-purple-500/10 text-zinc-100 border border-blue-500/15"
                : "text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.06]"
            )}
          >
            <Hash className="h-3.5 w-3.5 text-zinc-400 shrink-0" />
            <span className="truncate">{ch.name}</span>
          </button>
        ))}
        {customChannels.length === 0 && (
          <span className="px-2.5 py-1 text-xs text-zinc-600 italic block">No custom channels</span>
        )}
      </div>
    </div>
  );
}

function GatewaySelector() {
  const { data: session } = useSession();
  const [gateways, setGateways] = useState<Array<{ _id: string; name: string; slug: string }>>([]);
  const [activeId, setActiveId] = useState<string>("");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    gatewayFetch("/api/gateways")
      .then((r) => r.json())
      .then((d) => {
        setGateways(d.gateways || []);
        // Read from cookie or session
        const cookie = document.cookie.split("; ").find((c) => c.startsWith("synapse-gateway="));
        const cookieId = cookie?.split("=")[1];
        const sessionGwId = (session?.user as any)?.gatewayId;
        setActiveId(cookieId || sessionGwId || d.gateways?.[0]?._id || "");
      })
      .catch(() => {});
  }, [session]);

  if (gateways.length <= 1) return null;

  const active = gateways.find((g) => g._id === activeId);

  const switchGateway = async (id: string) => {
    setActiveId(id);
    setOpen(false);
    document.cookie = `synapse-gateway=${id}; path=/; max-age=31536000; samesite=lax`;
    localStorage.setItem("synapse-gateway", id);
    try {
      await gatewayFetch("/api/gateways/switch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gatewayId: id }),
      });
    } catch {}
    // Reload to apply new gateway context
    window.location.reload();
  };

  return (
    <div className="px-3 py-2">
      <div className="relative">
        <button
          onClick={() => setOpen(!open)}
          className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-sm text-zinc-300 transition"
        >
          <span className="truncate">{active?.name || "Select Gateway"}</span>
          <ChevronDown className={cn("h-4 w-4 text-zinc-500 transition-transform", open && "rotate-180")} />
        </button>
        {open && (
          <div className="absolute top-full left-0 right-0 mt-2 bg-white/[0.07] backdrop-blur-3xl border border-white/[0.12] rounded-xl shadow-[0_16px_64px_rgba(0,0,0,0.4)] z-50 overflow-hidden">
            {gateways.map((gw) => (
              <button
                key={gw._id}
                onClick={() => switchGateway(gw._id)}
                className={cn(
                  "w-full text-left px-3 py-2 text-sm hover:bg-white/10 transition",
                  gw._id === activeId ? "text-blue-400 bg-blue-500/10" : "text-zinc-300"
                )}
              >
                {gw.name}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ThemeToggleButton() {
  const { resolvedTheme, toggleTheme } = useTheme();
  return (
    <button
      onClick={toggleTheme}
      className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.08] transition-all border border-white/[0.08] bg-white/[0.04]"
      aria-label={`Switch to ${resolvedTheme === "dark" ? "light" : "dark"} mode`}
    >
      {resolvedTheme === "dark" ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
      {resolvedTheme === "dark" ? "Light Mode" : "Dark Mode"}
    </button>
  );
}

export function Sidebar({ onClose }: { onClose?: () => void }) {
  const pathname = usePathname();

  return (
    <div className="flex h-full flex-col bg-white/[0.04] backdrop-blur-2xl border-r border-white/[0.08] shadow-[0_8px_32px_rgba(0,0,0,0.3)]">
      {/* Logo */}
      <div className="flex items-center justify-between px-5 py-5">
        <Link href="/" className="flex items-center gap-2.5">
          <div className="flex items-center justify-center h-8 w-8 rounded-xl bg-gradient-to-br from-blue-500/20 to-purple-500/20 border border-white/[0.1]">
            <Zap className="h-4 w-4 text-blue-400" />
          </div>
          <span className="text-lg font-semibold tracking-tight text-zinc-100">Synapse</span>
        </Link>
        {onClose && (
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={onClose}
            aria-label="Close sidebar"
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>

      {/* Gateway switcher */}
      <GatewaySwitcher />

      <Separator />

      {/* Nav links */}
      <nav className="flex flex-col gap-1 px-3 py-2">
        {navLinks.map((link) => {
          const isActive =
            link.href === "/"
              ? pathname === "/"
              : pathname.startsWith(link.href);
          return (
            <Link
              key={link.href}
              href={link.href}
              onClick={onClose}
              className={cn(
                "flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium transition-all duration-200",
                isActive
                  ? "bg-gradient-to-r from-blue-500/10 to-purple-500/10 text-blue-300 border border-blue-500/20 shadow-[0_0_20px_rgba(59,130,246,0.1)]"
                  : "text-zinc-400 hover:bg-white/[0.06] hover:text-zinc-200"
              )}
            >
              <link.icon className={cn("h-4 w-4", isActive && "text-blue-400")} />
              {link.label}
            </Link>
          );
        })}
      </nav>

      <Separator />

      {/* Channels (on chat page) or Agents only - fills remaining space */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {pathname.startsWith("/chat") && <SidebarChannels />}
        <Separator />
        <SidebarAgents />
      </div>

      {/* Footer */}
      <div className="px-4 py-4 space-y-3 border-t border-white/[0.06]">
        <ThemeToggleButton />
        <InstallAppButton />
        <ConnectionStatus />
        <div className="text-[11px] text-zinc-600">Synapse v0.1.0</div>
      </div>
    </div>
  );
}
