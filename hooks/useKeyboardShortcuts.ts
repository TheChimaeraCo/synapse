"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";

export function useKeyboardShortcuts() {
  const [showHelp, setShowHelp] = useState(false);
  const router = useRouter();

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    const target = e.target as HTMLElement;
    const isInput = target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable;

    // Escape always works
    if (e.key === "Escape") {
      setShowHelp(false);
      // Close any modals/sidebars via custom event
      window.dispatchEvent(new Event("synapse:close-overlays"));
      return;
    }

    // Ctrl shortcuts work even in inputs
    if ((e.ctrlKey || e.metaKey) && e.key === "/") {
      e.preventDefault();
      setShowHelp(v => !v);
      return;
    }

    if ((e.ctrlKey || e.metaKey) && e.key === "n") {
      e.preventDefault();
      // Trigger new conversation
      window.dispatchEvent(new Event("synapse:new-conversation"));
      return;
    }

    if ((e.ctrlKey || e.metaKey) && e.key === ",") {
      e.preventDefault();
      router.push("/settings");
      return;
    }

    // ? only when not in input
    if (e.key === "?" && !isInput && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      setShowHelp(v => !v);
      return;
    }
  }, [router]);

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  return { showHelp, setShowHelp };
}

export const SHORTCUTS = [
  { keys: ["Ctrl", "/"], description: "Toggle shortcuts help" },
  { keys: ["?"], description: "Toggle shortcuts help" },
  { keys: ["Ctrl", "N"], description: "New conversation" },
  { keys: ["Ctrl", ","], description: "Open settings" },
  { keys: ["Esc"], description: "Close overlay / sidebar" },
];
