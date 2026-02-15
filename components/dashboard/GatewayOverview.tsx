"use client";

import { useGateway } from "@/contexts/GatewayContext";
import { useFetch } from "@/lib/hooks";
import Link from "next/link";
import { Settings, MessageSquare, Star, Cpu } from "lucide-react";

interface AgentData {
  name?: string;
  model?: string;
  status?: string;
  lastActive?: number;
  messagesToday?: number;
}

export function GatewayOverview() {
  const { activeGateway } = useGateway();
  const { data: agents } = useFetch<AgentData[]>(activeGateway ? "/api/agents" : null, 30000);

  if (!activeGateway) return null;

  return (
    <div className="bg-white/[0.04] backdrop-blur-2xl border border-white/[0.08] rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.3)] p-5 flex flex-col h-full">
      {/* Gateway Info */}
      <div className="flex items-start gap-3 mb-4">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500/20 to-purple-500/20 border border-white/[0.08] flex items-center justify-center text-lg flex-shrink-0">
          {activeGateway.icon || "⚡"}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-zinc-200 truncate">{activeGateway.name}</h3>
            {activeGateway.isMaster && <Star className="w-3.5 h-3.5 text-amber-400/60 flex-shrink-0" />}
          </div>
          <div className="flex items-center gap-2 mt-1">
            <span className={`inline-flex items-center gap-1.5 text-xs ${activeGateway.status === "active" ? "text-green-400" : "text-zinc-500"}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${activeGateway.status === "active" ? "bg-green-400 animate-pulse" : "bg-zinc-600"}`} />
              {activeGateway.status === "active" ? "Active" : "Paused"}
            </span>
          </div>
        </div>
      </div>

      {/* Metrics row */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        {[
          { label: "Members", value: activeGateway.memberCount ?? 0 },
          { label: "Messages", value: activeGateway.messageCount ?? 0 },
        ].map((m) => (
          <div key={m.label} className="bg-white/[0.04] rounded-lg px-3 py-2">
            <p className="text-[10px] text-zinc-500 uppercase tracking-wider">{m.label}</p>
            <p className="text-lg font-bold text-zinc-200">{m.value}</p>
          </div>
        ))}
      </div>

      {/* Agent Status */}
      {agents && agents.length > 0 && (
        <div className="border-t border-white/[0.06] pt-3 mb-4">
          <p className="text-[10px] text-zinc-500 uppercase tracking-wider mb-2">Agents</p>
          {agents.map((agent, i) => (
            <div key={i} className="flex items-center gap-2 py-1.5">
              <Cpu className="w-3.5 h-3.5 text-purple-400/60" />
              <span className="text-xs text-zinc-300 truncate flex-1">{agent.name || "AI Agent"}</span>
              {agent.model && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/[0.06] text-zinc-500 truncate max-w-[100px]">
                  {agent.model}
                </span>
              )}
              <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
                agent.status === "busy" ? "bg-blue-400 animate-spin" :
                agent.status === "online" || !agent.status ? "bg-green-400 animate-pulse" :
                "bg-zinc-600"
              }`} />
            </div>
          ))}
        </div>
      )}

      {/* Actions */}
      <div className="mt-auto flex gap-2">
        <Link
          href="/chat"
          className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-gradient-to-r from-blue-500/10 to-purple-500/10 border border-white/[0.08] text-xs text-zinc-300 hover:bg-white/[0.08] transition-all"
        >
          <MessageSquare className="w-3.5 h-3.5" />
          Chat
        </Link>
        <Link
          href="/settings"
          className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-white/[0.04] border border-white/[0.08] text-xs text-zinc-400 hover:bg-white/[0.08] transition-all"
        >
          <Settings className="w-3.5 h-3.5" />
          Settings
        </Link>
      </div>
    </div>
  );
}
