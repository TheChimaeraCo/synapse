"use client";

import { useState, useEffect, useCallback } from "react";
import { X, ArrowRight, Sparkles } from "lucide-react";

interface TourStep {
  target?: string; // CSS selector
  title: string;
  description: string;
  position?: "top" | "bottom" | "left" | "right";
}

const STEPS: TourStep[] = [
  {
    title: "Welcome to Synapse!",
    description: "Your self-hosted AI gateway is ready. Let's take a quick tour of the key features.",
  },
  {
    target: "[data-tour='sidebar']",
    title: "Navigation",
    description: "Use the sidebar to switch between Dashboard, Chat, Knowledge, and Settings. Everything you need is one click away.",
    position: "right",
  },
  {
    target: "[data-tour='chat-link']",
    title: "Chat",
    description: "Talk to your AI through channels. Each channel can have its own model, personality, and tools configured.",
    position: "right",
  },
  {
    target: "[data-tour='knowledge-link']",
    title: "Knowledge Base",
    description: "Add facts, instructions, and context that your AI can reference during conversations. Think of it as long-term memory.",
    position: "right",
  },
  {
    target: "[data-tour='settings-link']",
    title: "Settings",
    description: "Configure AI providers, models, channels, tools, voice, and more. This is your control center.",
    position: "right",
  },
  {
    title: "You're all set!",
    description: "Start chatting, add knowledge, or explore settings. You can always find help with the ? icons throughout the app.",
  },
];

const LS_KEY = "synapse_onboarding_complete";

export function OnboardingTour() {
  const [step, setStep] = useState(0);
  const [visible, setVisible] = useState(false);
  const [rect, setRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (localStorage.getItem(LS_KEY)) return;
    // Small delay so DOM is ready
    const t = setTimeout(() => setVisible(true), 800);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!visible) return;
    const s = STEPS[step];
    if (s.target) {
      const el = document.querySelector(s.target);
      if (el) {
        setRect(el.getBoundingClientRect());
        return;
      }
    }
    setRect(null);
  }, [step, visible]);

  const finish = useCallback(() => {
    localStorage.setItem(LS_KEY, "true");
    setVisible(false);
  }, []);

  const next = useCallback(() => {
    if (step >= STEPS.length - 1) {
      finish();
    } else {
      setStep(step + 1);
    }
  }, [step, finish]);

  if (!visible) return null;

  const current = STEPS[step];
  const isCenter = !rect;

  // Calculate tooltip position near target
  let tooltipStyle: React.CSSProperties = {};
  if (rect) {
    tooltipStyle = {
      position: "fixed",
      top: rect.top + rect.height / 2,
      left: rect.right + 16,
      transform: "translateY(-50%)",
    };
  }

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-[200] bg-black/60 backdrop-blur-sm" onClick={finish} />

      {/* Highlight cutout */}
      {rect && (
        <div
          className="fixed z-[201] border-2 border-blue-500/60 rounded-xl pointer-events-none"
          style={{
            top: rect.top - 4,
            left: rect.left - 4,
            width: rect.width + 8,
            height: rect.height + 8,
            boxShadow: "0 0 0 9999px rgba(0,0,0,0.55)",
          }}
        />
      )}

      {/* Tooltip card */}
      <div
        className={`fixed z-[202] w-80 p-5 bg-white/[0.07] backdrop-blur-2xl border border-white/10 rounded-2xl shadow-[0_16px_64px_rgba(0,0,0,0.5)] ${
          isCenter ? "top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" : ""
        }`}
        style={isCenter ? {} : tooltipStyle}
      >
        {/* Step indicator */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-1.5">
            {STEPS.map((_, i) => (
              <div
                key={i}
                className={`h-1 rounded-full transition-all ${
                  i === step ? "w-6 bg-gradient-to-r from-blue-500 to-blue-600" : i < step ? "w-2 bg-blue-500/40" : "w-2 bg-white/10"
                }`}
              />
            ))}
          </div>
          <button onClick={finish} className="text-zinc-500 hover:text-zinc-300 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {isCenter && step === 0 && (
          <div className="flex justify-center mb-3">
            <div className="p-3 rounded-xl bg-gradient-to-br from-blue-500/20 to-purple-500/20 border border-white/10">
              <Sparkles className="w-6 h-6 text-blue-400" />
            </div>
          </div>
        )}

        <h3 className="text-sm font-semibold text-zinc-100 mb-1.5">{current.title}</h3>
        <p className="text-xs text-zinc-400 leading-relaxed mb-4">{current.description}</p>

        <div className="flex items-center justify-between">
          <button onClick={finish} className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors">
            Skip tour
          </button>
          <button
            onClick={next}
            className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-medium text-white bg-gradient-to-r from-blue-500 to-blue-600 rounded-lg hover:brightness-110 transition-all"
          >
            {step >= STEPS.length - 1 ? "Get Started" : "Next"}
            <ArrowRight className="w-3 h-3" />
          </button>
        </div>
      </div>
    </>
  );
}
