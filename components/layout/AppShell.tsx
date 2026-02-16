"use client";

import { ReactNode, useState, useEffect } from "react";
import { Sidebar } from "./Sidebar";
import { Header } from "./Header";
import { Menu, X, Keyboard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useKeyboardShortcuts, SHORTCUTS } from "@/hooks/useKeyboardShortcuts";

function ShortcutsOverlay({ onClose }: { onClose: () => void }) {
  return (
    <>
      <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[101] w-80 rounded-2xl border border-white/[0.12] bg-white/[0.07] backdrop-blur-3xl p-6 shadow-[0_16px_64px_rgba(0,0,0,0.4)]">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Keyboard className="h-4 w-4 text-zinc-400" />
            <h3 className="text-sm font-semibold text-zinc-200">Keyboard Shortcuts</h3>
          </div>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300">
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
}: {
  children: ReactNode;
  title?: string;
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { showHelp, setShowHelp } = useKeyboardShortcuts();

  // Listen for close-overlays event
  useEffect(() => {
    const handler = () => setSidebarOpen(false);
    window.addEventListener("synapse:close-overlays", handler);
    return () => window.removeEventListener("synapse:close-overlays", handler);
  }, []);

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div
        className={`fixed inset-y-0 left-0 z-50 w-[280px] transform transition-transform duration-300 ease-out lg:relative lg:translate-x-0 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <Sidebar onClose={() => setSidebarOpen(false)} />
      </div>

      {/* Main content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header title={title}>
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu className="h-5 w-5" />
          </Button>
        </Header>
        <main className="flex-1 overflow-hidden">{children}</main>
      </div>

      {/* Keyboard shortcuts overlay */}
      {showHelp && <ShortcutsOverlay onClose={() => setShowHelp(false)} />}
    </div>
  );
}
