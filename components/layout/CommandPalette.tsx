"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "@/contexts/ThemeContext";
import {
  MessageSquare, Settings, Zap, FolderOpen, Brain, Sun, Moon, Trash2, Search, Command,
} from "lucide-react";

interface PaletteCommand {
  id: string;
  label: string;
  description: string;
  icon: React.ReactNode;
  shortcut?: string[];
  action: () => void;
}

function fuzzyMatch(query: string, text: string): boolean {
  const q = query.toLowerCase();
  const t = text.toLowerCase();
  let qi = 0;
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) qi++;
  }
  return qi === q.length;
}

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedIdx, setSelectedIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const { resolvedTheme, toggleTheme } = useTheme();

  const isCommandMode = query.startsWith(">");
  const searchQuery = isCommandMode ? query.slice(1).trim() : query;

  const commands: PaletteCommand[] = useMemo(() => [
    {
      id: "new-chat",
      label: "New Chat",
      description: "Start a new conversation",
      icon: <MessageSquare className="h-4 w-4" />,
      shortcut: ["Ctrl", "N"],
      action: () => { window.dispatchEvent(new Event("synapse:new-conversation")); close(); },
    },
    {
      id: "settings",
      label: "Settings",
      description: "Open settings page",
      icon: <Settings className="h-4 w-4" />,
      shortcut: ["Ctrl", ","],
      action: () => { router.push("/settings"); close(); },
    },
    {
      id: "analytics",
      label: "Analytics",
      description: "View usage analytics",
      icon: <Zap className="h-4 w-4" />,
      action: () => { router.push("/analytics"); close(); },
    },
    {
      id: "files",
      label: "Files",
      description: "Browse uploaded files",
      icon: <FolderOpen className="h-4 w-4" />,
      action: () => { router.push("/files"); close(); },
    },
    {
      id: "knowledge",
      label: "Knowledge",
      description: "View knowledge base",
      icon: <Brain className="h-4 w-4" />,
      action: () => { router.push("/knowledge"); close(); },
    },
    {
      id: "toggle-theme",
      label: "Toggle Theme",
      description: `Switch to ${resolvedTheme === "dark" ? "light" : "dark"} mode`,
      icon: resolvedTheme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />,
      action: () => { toggleTheme(); close(); },
    },
    {
      id: "clear-chat",
      label: "Clear Chat",
      description: "Clear current chat messages",
      icon: <Trash2 className="h-4 w-4" />,
      action: () => { window.dispatchEvent(new Event("synapse:clear-chat")); close(); },
    },
  ], [resolvedTheme, toggleTheme, router]);

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
    setSelectedIdx(0);
  }, []);

  const filteredCommands = useMemo(() => {
    if (!isCommandMode) return [];
    if (!searchQuery) return commands;
    return commands.filter(c => fuzzyMatch(searchQuery, c.label) || fuzzyMatch(searchQuery, c.description));
  }, [isCommandMode, searchQuery, commands]);

  // TODO: session search for non-command mode could be added later
  const showCommands = isCommandMode;

  // Ctrl+K to open
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        setOpen(v => !v);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  useEffect(() => {
    setSelectedIdx(0);
  }, [query]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    const items = showCommands ? filteredCommands : [];
    if (e.key === "Escape") {
      e.preventDefault();
      close();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIdx(i => Math.min(i + 1, items.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIdx(i => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (items[selectedIdx]) {
        items[selectedIdx].action();
      }
    }
  };

  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 z-[200] bg-black/60 backdrop-blur-sm" onClick={close} />
      <div className="fixed top-[20%] left-1/2 -translate-x-1/2 z-[201] w-full max-w-lg">
        <div className="rounded-2xl border border-white/[0.12] bg-white/[0.07] backdrop-blur-3xl shadow-[0_16px_64px_rgba(0,0,0,0.4)] overflow-hidden">
          <div className="flex items-center gap-3 px-4 py-3 border-b border-white/[0.08]">
            {isCommandMode ? (
              <Command className="h-4 w-4 text-blue-400 shrink-0" />
            ) : (
              <Search className="h-4 w-4 text-zinc-400 shrink-0" />
            )}
            <input
              ref={inputRef}
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder='Type ">" for commands, or search sessions...'
              className="flex-1 bg-transparent text-sm text-zinc-200 placeholder:text-zinc-500 outline-none"
            />
            <kbd className="px-1.5 py-0.5 rounded bg-white/[0.08] border border-white/[0.12] text-zinc-400 font-mono text-[10px]">
              Esc
            </kbd>
          </div>

          {showCommands && filteredCommands.length > 0 && (
            <div className="max-h-72 overflow-y-auto py-1">
              {filteredCommands.map((cmd, i) => (
                <button
                  key={cmd.id}
                  onClick={cmd.action}
                  onMouseEnter={() => setSelectedIdx(i)}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${
                    i === selectedIdx ? "bg-white/[0.08] text-zinc-100" : "text-zinc-400 hover:bg-white/[0.05]"
                  }`}
                >
                  <span className="shrink-0">{cmd.icon}</span>
                  <span className="flex-1 text-left">
                    <span className="font-medium text-zinc-200">{cmd.label}</span>
                    <span className="ml-2 text-xs text-zinc-500">{cmd.description}</span>
                  </span>
                  {cmd.shortcut && (
                    <div className="flex gap-1 shrink-0">
                      {cmd.shortcut.map((k, j) => (
                        <kbd key={j} className="px-1.5 py-0.5 rounded bg-white/[0.06] border border-white/[0.1] text-zinc-500 font-mono text-[10px]">
                          {k}
                        </kbd>
                      ))}
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}

          {showCommands && filteredCommands.length === 0 && searchQuery && (
            <div className="px-4 py-6 text-center text-sm text-zinc-500">
              No commands found
            </div>
          )}

          {!isCommandMode && !query && (
            <div className="px-4 py-4 text-center text-xs text-zinc-500">
              Type <kbd className="px-1 py-0.5 rounded bg-white/[0.06] border border-white/[0.1] font-mono">&gt;</kbd> to enter command mode
            </div>
          )}
        </div>
      </div>
    </>
  );
}
