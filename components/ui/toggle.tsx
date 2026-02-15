"use client";
import * as React from "react";
import { cn } from "@/lib/utils";

interface ToggleProps {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: string;
  description?: string;
  className?: string;
}

export function Toggle({ checked, onChange, label, className }: ToggleProps) {
  return (
    <label className={cn("flex items-center gap-3 cursor-pointer group", className)}>
      <div className={cn(
        "relative w-10 h-5 rounded-full transition-all duration-200 shrink-0",
        checked ? "bg-gradient-to-r from-blue-500 to-purple-500 shadow-[0_0_12px_rgba(59,130,246,0.25)]" : "bg-white/[0.08]"
      )}>
        <div className={cn(
          "absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-all duration-200",
          checked ? "left-[22px]" : "left-0.5"
        )} />
      </div>
      {label && <span className="text-sm text-zinc-300 group-hover:text-zinc-200 transition-colors">{label}</span>}
    </label>
  );
}
