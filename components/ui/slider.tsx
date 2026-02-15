"use client";
import * as React from "react";
import { cn } from "@/lib/utils";

interface SliderProps {
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
  className?: string;
  showValue?: boolean;
  formatValue?: (value: number) => string;
}

export function Slider({ value, min, max, step = 1, onChange, className }: SliderProps) {
  const percent = ((value - min) / (max - min)) * 100;
  
  return (
    <div className={cn("relative w-full h-5 flex items-center", className)}>
      <div className="relative w-full h-2 rounded-full bg-white/[0.06] overflow-hidden">
        <div 
          className="absolute h-full rounded-full bg-gradient-to-r from-blue-500 to-purple-500 transition-all duration-150"
          style={{ width: `${percent}%` }}
        />
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
      />
      <div 
        className="absolute top-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-white border-2 border-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.3)] pointer-events-none transition-all duration-150"
        style={{ left: `calc(${percent}% - 8px)` }}
      />
    </div>
  );
}
