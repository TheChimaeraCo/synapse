"use client";

import { useEffect, useState } from "react";
import { Download, X, Share, MoreVertical } from "lucide-react";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function ServiceWorkerRegistration() {
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [showBanner, setShowBanner] = useState(false);

  useEffect(() => {
    // Register service worker
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(console.error);
    }

    // Check if already dismissed
    if (localStorage.getItem("pwa-install-dismissed")) {
      setDismissed(true);
    }

    // Check if already installed as PWA
    if (window.matchMedia("(display-mode: standalone)").matches) {
      setInstalled(true);
      return;
    }

    // Show banner after a short delay (give time for page to load)
    const timer = setTimeout(() => setShowBanner(true), 2000);

    // Capture the native install prompt
    const handler = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e as BeforeInstallPromptEvent);
    };

    window.addEventListener("beforeinstallprompt", handler);
    window.addEventListener("appinstalled", () => {
      setInstalled(true);
      setShowBanner(false);
    });

    return () => {
      clearTimeout(timer);
      window.removeEventListener("beforeinstallprompt", handler);
    };
  }, []);

  const handleInstall = async () => {
    if (installPrompt) {
      await installPrompt.prompt();
      const { outcome } = await installPrompt.userChoice;
      if (outcome === "accepted") {
        setInstalled(true);
        setShowBanner(false);
      }
      setInstallPrompt(null);
    }
  };

  const handleDismiss = () => {
    setDismissed(true);
    setShowBanner(false);
    localStorage.setItem("pwa-install-dismissed", "1");
  };

  if (installed || dismissed || !showBanner) return null;

  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
  const isAndroid = /Android/.test(navigator.userAgent);
  const isSafari = /Safari/.test(navigator.userAgent) && !/Chrome/.test(navigator.userAgent);

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 animate-in slide-in-from-bottom-4 fade-in duration-300 w-[90%] max-w-md">
      <div className="flex flex-col gap-3 px-5 py-4 rounded-2xl border border-white/[0.12] bg-white/[0.07] backdrop-blur-3xl shadow-[0_16px_64px_rgba(0,0,0,0.4)]">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center h-10 w-10 rounded-xl bg-gradient-to-br from-blue-500/15 to-purple-500/15 border border-white/[0.1] shrink-0">
            <Download className="h-5 w-5 text-blue-400" />
          </div>
          <div className="flex flex-col flex-1 min-w-0">
            <span className="text-sm font-medium text-zinc-200">Install Synapse</span>
            <span className="text-xs text-zinc-500">Add to home screen for the full experience</span>
          </div>
          <button
            onClick={handleDismiss}
            className="p-1 text-zinc-500 hover:text-zinc-300 transition-colors shrink-0"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {installPrompt ? (
          // Native install available (Chrome/Edge)
          <button
            onClick={handleInstall}
            className="w-full py-2 rounded-xl text-sm font-medium bg-gradient-to-r from-blue-500/80 to-purple-500/80 hover:from-blue-500 hover:to-purple-500 text-white transition-all"
          >
            Install App
          </button>
        ) : (
          // Manual instructions
          <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-xs text-zinc-400">
            {isIOS || isSafari ? (
              <>
                <Share className="h-4 w-4 text-blue-400 shrink-0" />
                <span>Tap <strong className="text-zinc-200">Share</strong> then <strong className="text-zinc-200">Add to Home Screen</strong></span>
              </>
            ) : isAndroid ? (
              <>
                <MoreVertical className="h-4 w-4 text-blue-400 shrink-0" />
                <span>Tap <strong className="text-zinc-200">⋮ Menu</strong> then <strong className="text-zinc-200">Install app</strong></span>
              </>
            ) : (
              <>
                <Download className="h-4 w-4 text-blue-400 shrink-0" />
                <span>Click the <strong className="text-zinc-200">install icon</strong> in your browser&apos;s address bar</span>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
