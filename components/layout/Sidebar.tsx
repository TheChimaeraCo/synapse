"use client";
import { gatewayFetch } from "@/lib/gatewayFetch";

import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect, useCallback, type ComponentType, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Bot,
  Brain,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ClipboardList,
  Download,
  FileText,
  FolderKanban,
  FolderOpen,
  BookOpen,
  Globe,
  Hash,
  LayoutDashboard,
  Loader2,
  MessageCircle,
  MessageSquare,
  Plus,
  Search,
  Send as SendIcon,
  Settings,
  Shield,
  Square,
  Sun,
  Moon,
  X,
  XCircle,
  Zap,
  ArrowRight,
} from "lucide-react";
import { useSession } from "next-auth/react";
import dynamic from "next/dynamic";
const ConversationModal = dynamic(() => import("@/components/chat/ConversationModal").then(m => ({ default: m.ConversationModal })), { ssr: false });
import { ConnectionStatus } from "@/components/ui/ConnectionStatus";
import { GatewaySwitcher } from "@/components/layout/GatewaySwitcher";
import { useTheme } from "@/contexts/ThemeContext";

interface NavLink {
  href: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
}

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

const navLinks: NavLink[] = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/chat", label: "Chat", icon: MessageSquare },
  { href: "/calendar", label: "Calendar", icon: CalendarDays },
  { href: "/vault", label: "Vault", icon: BookOpen },
  { href: "/knowledge", label: "Knowledge", icon: Brain },
  { href: "/files", label: "Files", icon: FolderOpen },
  { href: "/settings", label: "Settings", icon: Settings },
];

const secondaryNavLinks: NavLink[] = [
  { href: "/projects", label: "Projects", icon: FolderKanban },
  { href: "/analytics", label: "Analytics", icon: Zap },
  { href: "/parse-history", label: "Parse History", icon: ClipboardList },
  { href: "/docs", label: "API Docs", icon: FileText },
  { href: "/admin/audit", label: "Audit Log", icon: Shield },
];

function SidebarNavLink({
  link,
  pathname,
  onClose,
  compact = false,
}: {
  link: NavLink;
  pathname: string;
  onClose?: () => void;
  compact?: boolean;
}) {
  const tourId = link.href === "/chat" ? "chat-link" : link.href === "/knowledge" ? "knowledge-link" : link.href === "/settings" ? "settings-link" : undefined;
  const isActive = link.href === "/" ? pathname === "/" : pathname.startsWith(link.href);
  return (
    <Link
      key={link.href}
      href={link.href}
      onClick={onClose}
      {...(tourId ? { "data-tour": tourId } : {})}
      className={cn(
        "group flex items-center gap-3 rounded-xl border px-3.5 font-semibold transition-all duration-200 ease-out",
        compact ? "py-2 text-xs" : "py-2.5 text-sm",
        isActive
          ? "border-cyan-300/35 bg-gradient-to-r from-cyan-500/20 via-teal-500/16 to-emerald-500/16 text-zinc-50 shadow-[0_8px_20px_rgba(6,182,212,0.22)]"
          : "border-transparent text-zinc-400 hover:border-white/[0.12] hover:bg-white/[0.07] hover:text-zinc-100"
      )}
    >
      <link.icon className={cn("h-4 w-4 shrink-0 transition-colors", isActive ? "text-cyan-100" : "text-zinc-500 group-hover:text-zinc-200")} />
      <span className="truncate">{link.label}</span>
    </Link>
  );
}

function SidebarMore({ pathname, links, onClose }: { pathname: string; links: NavLink[]; onClose?: () => void }) {
  const [open, setOpen] = useState(false);
  const hasActiveSecondary = links.some(
    (l) => pathname.startsWith(l.href)
  );

  // Auto-open if a secondary link is active
  useEffect(() => {
    if (hasActiveSecondary) setOpen(true);
  }, [hasActiveSecondary]);

  if (links.length === 0) return null;

  return (
    <div className="pt-1">
      <button
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "w-full flex items-center gap-3 rounded-xl border border-transparent px-3.5 py-2 text-xs font-medium transition-all duration-200 text-zinc-500 hover:border-white/[0.12] hover:bg-white/[0.08] hover:text-zinc-100",
          hasActiveSecondary && !open && "text-zinc-300"
        )}
      >
        <ChevronDown className={cn("h-3.5 w-3.5 transition-transform duration-200", open && "rotate-180")} />
        <span>More</span>
        <span className="ml-auto text-[10px] text-zinc-600">{links.length}</span>
      </button>
      <div
        className={cn(
          "grid transition-[grid-template-rows,opacity] duration-300 ease-out",
          open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-70"
        )}
      >
        <div className="overflow-hidden">
          <div className="mt-1.5 space-y-1">
            {links.map((link) => (
              <SidebarNavLink key={link.href} link={link} pathname={pathname} onClose={onClose} compact />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function SidebarSection({
  title,
  icon: Icon,
  count,
  defaultOpen = true,
  storageKey,
  children,
}: {
  title: string;
  icon: ComponentType<{ className?: string }>;
  count?: number;
  defaultOpen?: boolean;
  storageKey?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  useEffect(() => {
    if (!storageKey) return;
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw === "0") setOpen(false);
      if (raw === "1") setOpen(true);
    } catch {}
  }, [storageKey]);

  useEffect(() => {
    if (!storageKey) return;
    try {
      localStorage.setItem(storageKey, open ? "1" : "0");
    } catch {}
  }, [storageKey, open]);

  return (
    <div className="px-2 py-2">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-1.5 px-1 text-left transition-colors hover:text-zinc-100"
      >
        <Icon className="h-3.5 w-3.5 text-zinc-400" />
        <span className="text-[11px] font-medium uppercase tracking-wider text-zinc-400">{title}</span>
        {typeof count === "number" && <span className="ml-auto text-[10px] text-zinc-500">{count}</span>}
        <ChevronDown className={cn("h-3.5 w-3.5 text-zinc-500 transition-transform duration-200", !open && "-rotate-90")} />
      </button>
      <div
        className={cn(
          "grid transition-[grid-template-rows,opacity] duration-300 ease-out",
          open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-80"
        )}
      >
        <div className="overflow-hidden pt-1.5">{children}</div>
      </div>
    </div>
  );
}

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

interface InstalledModule {
  id: string;
  name: string;
  description?: string;
  icon?: string;
  enabled?: boolean;
  tools?: Array<{ name: string; description: string }>;
  routes?: Array<{ path: string; title?: string; icon?: string }>;
  installedAt?: number;
  version?: string;
}

function SidebarModules({ onClose }: { onClose?: () => void }) {
  const [modules, setModules] = useState<InstalledModule[]>([]);
  const [selectedModule, setSelectedModule] = useState<InstalledModule | null>(null);

  useEffect(() => {
    const fetchModules = async () => {
      try {
        const res = await gatewayFetch("/api/modules");
        if (res.ok) {
          const data = await res.json();
          const installed = (data.installed || data.modules || []).filter((m: InstalledModule) => m.enabled !== false);
          setModules(installed);
        }
      } catch {}
    };
    fetchModules();
    const interval = setInterval(fetchModules, 30000);
    return () => clearInterval(interval);
  }, []);

  if (modules.length === 0) return null;

  return (
    <SidebarSection title="Modules" icon={Bot} count={modules.length} storageKey="sidebar:modules">
      <div className="space-y-0.5">
        {modules.map((mod) => {
          return (
            <div key={mod.name}>
              <button
                onClick={() => setSelectedModule(selectedModule?.name === mod.name ? null : mod)}
                className={cn(
                  "w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs transition-all duration-200",
                  selectedModule?.name === mod.name
                    ? "bg-gradient-to-r from-cyan-500/18 to-emerald-500/14 text-cyan-100 border border-cyan-300/25"
                    : "text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.06]"
                )}
              >
                <span className="text-sm shrink-0">{mod.icon || "📦"}</span>
                <span className="truncate capitalize">{mod.name.replace(/-/g, " ")}</span>
                {mod.tools && mod.tools.length > 0 && (
                  <span className="text-[10px] text-zinc-600 ml-auto">{mod.tools.length}</span>
                )}
              </button>
              {selectedModule?.name === mod.name && (
                <div className="ml-6 mt-1 space-y-1">
                  <Link
                    href={`/modules/${mod.id}`}
                    onClick={onClose}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-[11px] text-cyan-100 hover:bg-cyan-500/10 transition-all"
                  >
                    <span className="text-xs">🖥</span>
                    <span>Open UI</span>
                  </Link>
                  {mod.routes?.map((route) => (
                    <Link
                      key={route.path}
                      href={route.path}
                      onClick={onClose}
                      className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-[11px] text-cyan-100 hover:bg-cyan-500/10 transition-all"
                    >
                      <span className="text-xs">{route.icon || "📄"}</span>
                      <span>{route.title || route.path}</span>
                    </Link>
                  ))}
                  {mod.tools && mod.tools.length > 0 && (
                    <div className="px-3 py-1 text-[10px] text-zinc-600">
                      {mod.tools.length} tool{mod.tools.length !== 1 ? "s" : ""}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </SidebarSection>
  );
}

function SidebarAgents() {
  const [agents, setAgents] = useState<WorkerAgent[]>([]);
  const [showHistory, setShowHistory] = useState(true);
  const [showAllHistory, setShowAllHistory] = useState(false);

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

  const hasRunning = agents.some((a) => a.status === "running");
  useEffect(() => {
    fetchAgents();
    const interval = setInterval(fetchAgents, hasRunning ? 2000 : 15000);
    return () => clearInterval(interval);
  }, [fetchAgents, hasRunning]);

  useEffect(() => {
    const handler = () => fetchAgents();
    window.addEventListener("synapse:agent_update", handler);
    return () => window.removeEventListener("synapse:agent_update", handler);
  }, [fetchAgents]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("sidebar:agents:history");
      if (raw === "0") setShowHistory(false);
      if (raw === "1") setShowHistory(true);
    } catch {}
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem("sidebar:agents:history", showHistory ? "1" : "0");
    } catch {}
  }, [showHistory]);

  const running = agents
    .filter((a) => a.status === "running")
    .sort((a, b) => b.startedAt - a.startedAt);
  const past = agents
    .filter((a) => a.status !== "running")
    .sort((a, b) => (b.completedAt || b.startedAt) - (a.completedAt || a.startedAt));
  const visiblePast = showAllHistory ? past : past.slice(0, 12);

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
    <SidebarSection title="Agents" icon={Bot} count={agents.length} storageKey="sidebar:agents">
      <div className="space-y-3">
        {/* Active agents */}
        {running.length > 0 && (
          <div>
            <div className="flex items-center gap-1.5 px-1 mb-1">
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
              <span className="text-[11px] font-medium text-zinc-500 uppercase tracking-wider">History</span>
              <span className="text-[10px] text-zinc-600 ml-auto">{past.length}</span>
            </button>
            <div className="px-1 mb-2 text-[10px] text-zinc-600 font-mono flex items-center justify-between gap-2">
              <span>
                {formatTokens(historyStats.tokens)}t{historyStats.cost > 0 ? ` · $${historyStats.cost.toFixed(3)}` : ""}
              </span>
              <span className="text-zinc-700">last 24h</span>
            </div>
            <div
              className={cn(
                "grid transition-[grid-template-rows,opacity] duration-300 ease-out",
                showHistory ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-80"
              )}
            >
              <div className="space-y-1.5 overflow-hidden">
                {visiblePast.map(a => <AgentItem key={a._id} agent={a} />)}
                {past.length > 12 && (
                  <button
                    onClick={() => setShowAllHistory((v) => !v)}
                    className="w-full rounded-lg border border-white/[0.08] bg-white/[0.02] px-2 py-1 text-[10px] text-zinc-500 transition hover:bg-white/[0.05] hover:text-zinc-300"
                  >
                    {showAllHistory ? "Show less" : `Show ${past.length - 12} more`}
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </SidebarSection>
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
          {c.previousConvoId && <span className="text-cyan-300 mr-1">🔗</span>}
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
  const [channelFilter, setChannelFilter] = useState("");

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
  const normalizedFilter = channelFilter.trim().toLowerCase();
  const filteredPlatformChannels = normalizedFilter
    ? platformChannels.filter((c) => c.name.toLowerCase().includes(normalizedFilter) || c.platform.toLowerCase().includes(normalizedFilter))
    : platformChannels;
  const filteredCustomChannels = normalizedFilter
    ? customChannels.filter((c) => c.name.toLowerCase().includes(normalizedFilter))
    : customChannels;

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
    <SidebarSection title="Channels" icon={MessageCircle} count={channels.length} storageKey="sidebar:channels">
      <div className="space-y-1">
        <div className="relative pb-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-600" />
          <input
            value={channelFilter}
            onChange={(e) => setChannelFilter(e.target.value)}
            placeholder="Filter channels..."
            className="h-8 w-full rounded-lg border border-white/[0.12] bg-white/[0.04] pl-8 pr-2 text-xs text-zinc-100 outline-none transition-colors placeholder:text-zinc-500 focus:border-cyan-300/50 focus:bg-white/[0.08]"
          />
        </div>
        {filteredPlatformChannels.length > 0 && (
          <div>
            <div className="px-1 py-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Platforms</span>
            </div>
            {filteredPlatformChannels.map((ch) => (
              <button
                key={ch._id}
                onClick={() => selectChannel(ch._id)}
                className={cn(
                  "w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm transition-all duration-200",
                  ch._id === activeChannelId
                    ? "bg-gradient-to-r from-cyan-500/18 to-emerald-500/14 text-zinc-50 border border-cyan-300/25"
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
          {filteredCustomChannels.map((ch) => (
            <button
              key={ch._id}
              onClick={() => selectChannel(ch._id)}
              className={cn(
                "w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm transition-all duration-200",
                ch._id === activeChannelId
                  ? "bg-gradient-to-r from-cyan-500/18 to-emerald-500/14 text-zinc-50 border border-cyan-300/25"
                  : "text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.06]"
              )}
            >
              <Hash className="h-3.5 w-3.5 text-zinc-400 shrink-0" />
              <span className="truncate">{ch.name}</span>
            </button>
          ))}
          {filteredCustomChannels.length === 0 && (
            <span className="px-2.5 py-1 text-xs text-zinc-600 italic block">No custom channels</span>
          )}
        </div>
      </div>
    </SidebarSection>
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

function ThemeToggleCompact() {
  const { resolvedTheme, toggleTheme } = useTheme();
  return (
    <button
      onClick={toggleTheme}
      className="flex items-center justify-center h-8 w-8 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.08] transition-all border border-white/[0.08] bg-white/[0.04]"
      aria-label={`Switch to ${resolvedTheme === "dark" ? "light" : "dark"} mode`}
    >
      {resolvedTheme === "dark" ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
    </button>
  );
}

export function Sidebar({ onClose }: { onClose?: () => void }) {
  const pathname = usePathname();
  const [navFilter, setNavFilter] = useState("");
  const trimmedFilter = navFilter.trim().toLowerCase();
  const filteredPrimaryLinks = trimmedFilter
    ? navLinks.filter((link) => link.label.toLowerCase().includes(trimmedFilter))
    : navLinks;
  const filteredSecondaryLinks = trimmedFilter
    ? secondaryNavLinks.filter((link) => link.label.toLowerCase().includes(trimmedFilter))
    : secondaryNavLinks;
  const hasAnyNavMatch = filteredPrimaryLinks.length > 0 || filteredSecondaryLinks.length > 0;

  return (
    <div className="flex h-full flex-col overflow-hidden border-r border-white/[0.12] bg-[linear-gradient(180deg,rgba(5,18,32,0.82),rgba(8,20,34,0.72))] backdrop-blur-2xl shadow-[0_24px_44px_rgba(6,12,24,0.34)]">
      {/* Logo */}
      <div className="flex items-center justify-between px-5 py-5">
        <Link href="/" className="flex items-center gap-2.5">
          <div className="flex items-center justify-center h-8 w-8 rounded-xl bg-gradient-to-br from-cyan-500/25 to-emerald-500/20 border border-white/[0.16] shadow-[0_8px_20px_rgba(6,182,212,0.2)]">
            <Zap className="h-4 w-4 text-cyan-100" />
          </div>
          <span className="text-lg font-semibold tracking-tight text-zinc-50">Synapse</span>
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
      <nav data-tour="sidebar" className="flex flex-col gap-1 px-3 py-2">
        <div className="relative pb-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-600" />
          <input
            value={navFilter}
            onChange={(e) => setNavFilter(e.target.value)}
            placeholder="Jump to..."
            className="h-8 w-full rounded-lg border border-white/[0.12] bg-white/[0.04] pl-8 pr-2 text-xs text-zinc-100 outline-none transition-colors placeholder:text-zinc-500 focus:border-cyan-300/50 focus:bg-white/[0.08]"
          />
        </div>
        {filteredPrimaryLinks.map((link) => (
          <SidebarNavLink key={link.href} link={link} pathname={pathname} onClose={onClose} />
        ))}
        {!hasAnyNavMatch && (
          <div className="rounded-xl border border-white/[0.12] bg-white/[0.04] px-3 py-2 text-xs text-zinc-500">
            No matching pages.
          </div>
        )}
        <SidebarMore pathname={pathname} links={filteredSecondaryLinks} onClose={onClose} />
      </nav>

      <Separator />

      {/* Channels + agents - fills remaining space */}
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
        {pathname.startsWith("/chat") && <SidebarChannels />}
        <SidebarModules onClose={onClose} />
        <SidebarAgents />
      </div>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-white/[0.1] space-y-2">
        <div className="flex items-center gap-2">
          <ThemeToggleCompact />
          <InstallAppButton />
        </div>
        <div className="flex items-center justify-between">
          <div className="text-[10px] text-zinc-600">Synapse v0.2.0</div>
          <ConnectionStatus />
        </div>
      </div>
    </div>
  );
}
