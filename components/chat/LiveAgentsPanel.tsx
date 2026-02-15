"use client";
import { gatewayFetch } from "@/lib/gatewayFetch";

import { useState, useEffect, useCallback } from "react";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, ChevronUp, Bot, CheckCircle2, XCircle, Loader2 } from "lucide-react";

interface WorkerAgent {
  _id: string;
  label: string;
  status: string;
  model?: string;
  startedAt: number;
  completedAt?: number;
  tokens?: { input: number; output: number };
  cost?: number;
  context?: string;
  error?: string;
}

interface LiveAgentsPanelProps {
  sessionId: string;
  gatewayId: string;
}

function ElapsedTime({ startedAt, completedAt }: { startedAt: number; completedAt?: number }) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (completedAt) return;
    const id = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(id);
  }, [completedAt]);

  const end = completedAt || now;
  const ms = end - startedAt;
  if (ms < 1000) return <span className="text-xs text-zinc-500 font-mono">{ms}ms</span>;
  return <span className="text-xs text-zinc-500 font-mono">{(ms / 1000).toFixed(1)}s</span>;
}

function formatTokens(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

function AgentCard({ agent }: { agent: WorkerAgent }) {
  const isRunning = agent.status === "running";
  const isFailed = agent.status === "failed";
  const borderColor = isRunning ? "border-blue-500" : isFailed ? "border-red-500" : "border-green-500";

  return (
    <div className={`flex items-center gap-2 sm:gap-3 px-2 sm:px-3 py-1.5 border-l-2 ${borderColor} bg-white/[0.03] rounded-r-lg`}>
      <div className="flex items-center gap-1.5 min-w-0 flex-1">
        {isRunning ? (
          <span className="relative flex h-2 w-2 shrink-0">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500" />
          </span>
        ) : isFailed ? (
          <XCircle className="h-3.5 w-3.5 text-red-500 shrink-0" />
        ) : (
          <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" />
        )}
        <span className="text-xs font-medium text-zinc-300 truncate">{agent.label}</span>
        {agent.model && (
          <Badge variant="outline" className="text-[10px] px-1 py-0 h-4 text-zinc-500 border-white/[0.1]">
            {agent.model.split("/").pop()?.split("-").slice(0, 2).join("-") || agent.model}
          </Badge>
        )}
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <ElapsedTime startedAt={agent.startedAt} completedAt={agent.completedAt} />
        {agent.tokens && (
          <span className="text-[10px] text-zinc-500 font-mono">
            {formatTokens(agent.tokens.input + agent.tokens.output)}t
          </span>
        )}
        {agent.cost !== undefined && agent.cost > 0 && (
          <span className="text-[10px] text-zinc-500 font-mono">
            ${agent.cost.toFixed(4)}
          </span>
        )}
      </div>
    </div>
  );
}

export function LiveAgentsPanel({ sessionId, gatewayId }: LiveAgentsPanelProps) {
  const [agents, setAgents] = useState<WorkerAgent[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [summary, setSummary] = useState({ count: 0, tokens: 0, cost: 0 });

  const fetchAgents = useCallback(async () => {
    try {
      const res = await gatewayFetch(`/api/agents/workers?sessionId=${sessionId}`);
      if (res.ok) {
        const data = await res.json();
        const list: WorkerAgent[] = data.agents || [];
        setAgents(list);

        let totalTokens = 0, totalCost = 0;
        for (const a of list) {
          if (a.tokens) totalTokens += a.tokens.input + a.tokens.output;
          if (a.cost) totalCost += a.cost;
        }
        setSummary({ count: list.length, tokens: totalTokens, cost: totalCost });
      }
    } catch {}
  }, [sessionId]);

  useEffect(() => {
    fetchAgents();
    const hasRunning = agents.some((a) => a.status === "running");
    const interval = setInterval(fetchAgents, hasRunning ? 2000 : 10000);
    return () => clearInterval(interval);
  }, [fetchAgents, agents.length]);

  // Listen for custom events from useChat
  useEffect(() => {
    const handler = () => fetchAgents();
    window.addEventListener("synapse:agent_update", handler);
    return () => window.removeEventListener("synapse:agent_update", handler);
  }, [fetchAgents]);

  if (agents.length === 0) return null;

  const activeCount = agents.filter((a) => a.status === "running").length;

  return (
    <div className="border-t border-white/[0.06] bg-white/[0.02] backdrop-blur-2xl">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center justify-between px-4 py-1.5 text-xs text-zinc-400 hover:text-zinc-300 transition-colors"
      >
        <span className="flex items-center gap-1.5">
          <Bot className="h-3.5 w-3.5" />
          {activeCount > 0 ? (
            <>
              <span className="text-blue-400">Active Agents ({activeCount})</span>
              <Loader2 className="h-3 w-3 animate-spin text-blue-400" />
            </>
          ) : (
            <span>Agents ({agents.length})</span>
          )}
        </span>
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          {summary.count > 0 && (
            <span className="font-mono text-zinc-500 hidden sm:inline">
              {summary.count} runs | {formatTokens(summary.tokens)}t | ${summary.cost.toFixed(4)}
            </span>
          )}
          {summary.count > 0 && (
            <span className="font-mono text-zinc-500 sm:hidden">
              {summary.count} | {formatTokens(summary.tokens)}t
            </span>
          )}
          {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
        </div>
      </button>

      {expanded && (
        <div className="px-3 pb-2 space-y-1 max-h-40 overflow-y-auto">
          {agents.map((agent) => (
            <AgentCard key={agent._id} agent={agent} />
          ))}
        </div>
      )}
    </div>
  );
}
