"use client";

import { ReactNode, useState, useEffect } from "react";
import { Sidebar } from "./Sidebar";
import { Header } from "./Header";
import { Menu, X, Keyboard, PanelLeftOpen, PanelLeftClose } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useKeyboardShortcuts, SHORTCUTS } from "@/hooks/useKeyboardShortcuts";
import { CommandPalette } from "@/components/layout/CommandPalette";
import { OnboardingTour } from "@/components/OnboardingTour";
import { ChatPopout } from "@/components/chat/ChatPopout";

function ShortcutsOverlay({ onClose }: { onClose: () => void }) {
  return (
    <>
      <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div role="dialog" aria-labelledby="shortcuts-title" aria-modal="true" className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[101] w-80 rounded-2xl border border-white/[0.12] bg-white/[0.07] backdrop-blur-3xl p-6 shadow-[0_16px_64px_rgba(0,0,0,0.4)]">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Keyboard className="h-4 w-4 text-zinc-400" />
            <h3 id="shortcuts-title" className="text-sm font-semibold text-zinc-200">Keyboard Shortcuts</h3>
          </div>
          <button onClick={onClose} aria-label="Close shortcuts" className="text-zinc-500 hover:text-zinc-300">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="space-y-2">
          {SHORTCUTS.map((s, i) => (
            <div key={i} className="flex items-center justify-between text-xs">
              <span className="text-zinc-400">{s.description}</span>
              <div className="flex gap-1">
                {s.keys.map((k, j) => (
                  <kbd key={j} className="px-1.5 py-0.5 rounded bg-white/[0.08] border border-white/[0.12] text-zinc-300 font-mono text-[10px]">
                    {k}
                  </kbd>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

export function AppShell({
  children,
  title,
  immersive = false,
  defaultChromeHidden = false,
}: {
  children: ReactNode;
  title?: string;
  immersive?: boolean;
  defaultChromeHidden?: boolean;
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [chromeHidden, setChromeHidden] = useState(defaultChromeHidden);
  const { showHelp, setShowHelp } = useKeyboardShortcuts();
  const storageKey = `synapse:immersive-shell:${title || "global"}`;

  useEffect(() => {
    if (!immersive) return;
    try {
      const stored = window.localStorage.getItem(storageKey);
      if (stored === "hidden") setChromeHidden(true);
      if (stored === "visible") setChromeHidden(false);
    } catch {}
  }, [immersive, storageKey]);

  useEffect(() => {
    if (!immersive) return;
    try {
      window.localStorage.setItem(storageKey, chromeHidden ? "hidden" : "visible");
    } catch {}
  }, [chromeHidden, immersive, storageKey]);

  // Listen for close-overlays event
  useEffect(() => {
    const handler = () => setSidebarOpen(false);
    window.addEventListener("synapse:close-overlays", handler);
    return () => window.removeEventListener("synapse:close-overlays", handler);
  }, []);

  useEffect(() => {
    if (!immersive) return;
    const onKey = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.shiftKey || event.altKey) return;
      if (event.key !== "\\") return;
      event.preventDefault();
      setChromeHidden((prev) => !prev);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [immersive]);

  const chromeVisible = !immersive || !chromeHidden;

  useEffect(() => {
    if (!chromeVisible) setSidebarOpen(false);
  }, [chromeVisible]);

  return (
    <div className="fixed inset-0 z-0 flex min-h-0 overflow-hidden">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -top-32 right-[-10rem] h-[28rem] w-[28rem] rounded-full bg-cyan-400/12 blur-3xl" />
        <div className="absolute -bottom-40 left-[-14rem] h-[30rem] w-[30rem] rounded-full bg-emerald-400/10 blur-3xl" />
      </div>
      {/* Mobile overlay */}
      {chromeVisible && sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      {chromeVisible ? (
        <aside
          className={`fixed inset-y-0 left-0 z-50 w-[296px] transform transition-transform duration-300 ease-out lg:relative lg:translate-x-0 ${
            sidebarOpen ? "translate-x-0" : "-translate-x-full"
          }`}
          aria-label="Main navigation"
        >
          <Sidebar onClose={() => setSidebarOpen(false)} />
        </aside>
      ) : null}

      {/* Main content */}
      <div className="flex flex-1 flex-col overflow-hidden bg-transparent">
        {chromeVisible ? (
          <Header title={title}>
            {immersive ? (
              <Button
                variant="ghost"
                size="icon"
                className="hidden lg:inline-flex"
                onClick={() => setChromeHidden(true)}
                aria-label="Hide app chrome"
                title="Hide app chrome"
              >
                <PanelLeftClose className="h-5 w-5" />
              </Button>
            ) : null}
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden"
              onClick={() => setSidebarOpen(true)}
              aria-label="Open sidebar"
            >
              <Menu className="h-5 w-5" />
            </Button>
          </Header>
        ) : null}
        <main className="flex-1 overflow-hidden">{children}</main>
      </div>

      {immersive ? (
        <button
          type="button"
          onClick={() => setChromeHidden((prev) => !prev)}
          className="fixed left-4 top-4 z-[65] inline-flex h-9 w-9 items-center justify-center rounded-lg border border-white/[0.14] bg-slate-950/60 text-zinc-200 backdrop-blur-md hover:bg-slate-900/80"
          title={chromeHidden ? "Show app chrome" : "Hide app chrome"}
          aria-label={chromeHidden ? "Show app chrome" : "Hide app chrome"}
        >
          {chromeHidden ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
        </button>
      ) : null}

      {/* Command palette */}
      <CommandPalette />

      {/* Keyboard shortcuts overlay */}
      {showHelp && <ShortcutsOverlay onClose={() => setShowHelp(false)} />}

      {/* Onboarding tour */}
      <OnboardingTour />

      {/* Global chat popout */}
      <ChatPopout />
    </div>
  );
}
