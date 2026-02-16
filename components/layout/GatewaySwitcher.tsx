"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useGateway } from "@/contexts/GatewayContext";
import { cn } from "@/lib/utils";
import { ChevronDown, Plus, Settings, Crown, Loader2 } from "lucide-react";

const ROLE_COLORS: Record<string, string> = {
  owner: "text-amber-400 border-amber-500/30 bg-amber-500/10",
  admin: "text-blue-400 border-blue-500/30 bg-blue-500/10",
  member: "text-zinc-400 border-white/[0.08] bg-white/[0.06]",
  viewer: "text-zinc-500 border-white/[0.10]/30 bg-white/[0.06]",
};

export function GatewaySwitcher() {
  const { gateways, activeGateway, activeRole, loading, switchGateway } = useGateway();
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  if (loading) {
    return (
      <div className="px-3 py-2">
        <div className="flex items-center gap-2 px-3.5 py-3 rounded-xl bg-white/[0.04] border border-white/[0.08]">
          <Loader2 className="h-4 w-4 text-zinc-500 animate-spin" />
          <span className="text-sm text-zinc-500">Loading...</span>
        </div>
      </div>
    );
  }

  if (gateways.length === 0) {
    return (
      <div className="px-3 py-2">
        <button
          onClick={() => router.push("/gateways")}
          className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl bg-blue-600/10 hover:bg-blue-600/20 border border-blue-500/20 text-sm text-blue-400 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Create your first gateway
        </button>
      </div>
    );
  }

  const getIcon = (gw: { icon?: string; name: string }) =>
    gw.icon || gw.name.charAt(0).toUpperCase();

  const handleSwitch = async (id: string) => {
    setOpen(false);
    if (id === activeGateway?._id) return;
    await switchGateway(id);
    // Soft reload - let components react to gateway-changed event
    window.location.reload();
  };

  return (
    <div className="px-3 py-2" ref={dropdownRef}>
      <div className="relative">
        <button
          onClick={() => setOpen(!open)}
          className="w-full flex items-center gap-2.5 px-3.5 py-3 rounded-xl bg-white/[0.04] hover:bg-white/[0.07] border border-white/[0.08] hover:border-white/[0.12] transition-all duration-200"
        >
          {/* Icon */}
          <span className="flex items-center justify-center h-7 w-7 rounded-lg bg-white/[0.07] text-sm font-semibold text-zinc-200 shrink-0">
            {getIcon(activeGateway || { name: "?" })}
          </span>

          {/* Name + role */}
          <div className="flex-1 min-w-0 text-left">
            <div className="text-sm font-medium text-zinc-200 truncate flex items-center gap-1.5">
              {activeGateway?.name || "Select Gateway"}
              {activeGateway?.isMaster && <Crown className="h-3 w-3 text-amber-400 shrink-0" />}
            </div>
            {activeRole && (
              <span className="text-[10px] text-zinc-500 capitalize">{activeRole}</span>
            )}
          </div>

          <ChevronDown className={cn("h-4 w-4 text-zinc-500 transition-transform shrink-0", open && "rotate-180")} />
        </button>

        {/* Dropdown */}
        {open && (
          <div className="absolute top-full left-0 right-0 mt-2 bg-[#1a1a2e]/95 backdrop-blur-3xl border border-white/[0.15] rounded-xl shadow-[0_16px_64px_rgba(0,0,0,0.6)] z-[100] overflow-hidden">
            <div className="max-h-64 overflow-y-auto py-1">
              {gateways.map((gw) => (
                <button
                  key={gw._id}
                  onClick={() => handleSwitch(gw._id)}
                  className={cn(
                    "w-full flex items-center gap-2.5 px-3.5 py-2.5 text-left transition-all duration-200",
                    gw._id === activeGateway?._id
                      ? "bg-gradient-to-r from-blue-500/10 to-purple-500/10"
                      : "hover:bg-white/[0.08]"
                  )}
                >
                  <span className="flex items-center justify-center h-7 w-7 rounded-lg bg-white/[0.07] text-sm font-semibold text-zinc-200 shrink-0">
                    {getIcon(gw)}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-zinc-200 truncate flex items-center gap-1.5">
                      {gw.name}
                      {gw.isMaster && <Crown className="h-3 w-3 text-amber-400" />}
                    </div>
                  </div>
                  {gw.role && (
                    <span className={cn("text-[10px] px-1.5 py-0.5 rounded-full border capitalize", ROLE_COLORS[gw.role] || ROLE_COLORS.member)}>
                      {gw.role}
                    </span>
                  )}
                </button>
              ))}
            </div>

            <div className="border-t border-white/[0.08] py-1">
              <button
                onClick={() => { setOpen(false); router.push("/gateways"); }}
                className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.08] transition-all"
              >
                <Plus className="h-4 w-4" />
                Create Gateway
                {gateways.length >= 1 && (
                  <span className="ml-auto text-[10px] text-zinc-500">{gateways.length} used</span>
                )}
              </button>
              <button
                onClick={() => { setOpen(false); router.push("/settings?tab=gateways"); }}
                className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.08] transition-all"
              >
                <Settings className="h-4 w-4" />
                Manage Gateways
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
