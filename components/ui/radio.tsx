"use client";
import * as React from "react";
import { cn } from "@/lib/utils";

interface RadioProps {
  checked: boolean;
  onChange: () => void;
  label?: string;
  className?: string;
}

export function Radio({ checked, onChange, label, className }: RadioProps) {
  return (
    <label className={cn("flex items-center gap-2.5 cursor-pointer group", className)}>
      <div 
        onClick={(e) => { e.preventDefault(); onChange(); }}
        className={cn(
          "w-5 h-5 rounded-full border transition-all duration-150 flex items-center justify-center shrink-0",
          checked 
            ? "border-blue-500/50 shadow-[0_0_8px_rgba(59,130,246,0.2)]" 
            : "bg-white/[0.04] border-white/[0.12] group-hover:border-white/[0.2]"
        )}
      >
        {checked && <div className="w-2.5 h-2.5 rounded-full bg-gradient-to-r from-blue-500 to-purple-500" />}
      </div>
      {label && <span className="text-sm text-zinc-300">{label}</span>}
    </label>
  );
}
