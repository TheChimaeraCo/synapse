"use client";

import { useState, useRef, useEffect } from "react";
import { HelpCircle } from "lucide-react";

interface HelpTooltipProps {
  title: string;
  content: string;
  className?: string;
  size?: "sm" | "md";
}

export function HelpTooltip({ title, content, className = "", size = "sm" }: HelpTooltipProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const iconSize = size === "sm" ? "w-3.5 h-3.5" : "w-4 h-4";

  return (
    <span ref={ref} className={`relative inline-flex ml-1.5 align-middle ${className}`}>
      <button
        type="button"
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen(!open); }}
        className="text-zinc-500 hover:text-zinc-300 transition-colors"
        aria-label="Help"
      >
        <HelpCircle className={iconSize} />
      </button>
      {open && (
        <div className="absolute z-[60] bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 px-4 py-3 text-xs bg-white/[0.07] backdrop-blur-2xl border border-white/10 rounded-xl shadow-[0_8px_32px_rgba(0,0,0,0.4)]">
          <p className="font-semibold text-zinc-200 mb-1">{title}</p>
          <p className="text-zinc-400 leading-relaxed">{content}</p>
          <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-px w-2 h-2 bg-white/[0.07] border-b border-r border-white/10 rotate-45" />
        </div>
      )}
    </span>
  );
}
