"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { gatewayFetch } from "@/lib/gatewayFetch";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface SoulData {
  userName?: string;
  agentName?: string;
  timezone?: string;
  personality?: string;
  purpose?: string;
  tone?: string;
  interests?: string[];
  occupation?: string;
  emoji?: string;
}

export default function OnboardingPage() {
  const router = useRouter();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [soulData, setSoulData] = useState<SoulData>({});
  const [readyToLive, setReadyToLive] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [started, setStarted] = useState(false);
  const [telegramStep, setTelegramStep] = useState<"hidden" | "checking" | "prompt" | "waiting" | "done" | "skipped">("hidden");
  const [telegramBot, setTelegramBot] = useState<{ username: string; firstName: string } | null>(null);
  const [telegramPending, setTelegramPending] = useState<Array<{ telegramId: string; displayName: string; username?: string }>>([]);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Check status and start onboarding
  useEffect(() => {
    (async () => {
      try {
        const res = await gatewayFetch("/api/onboarding");
        const data = await res.json();
        if (data.complete) {
          router.replace("/chat");
          return;
        }
        if (data.state?.status === "complete") {
          router.replace("/chat");
          return;
        }
        // Resume existing conversation
        if (data.state?.messages?.length) {
          setMessages(data.state.messages.map((m: any) => ({ role: m.role, content: m.content })));
          if (data.state.soulData) setSoulData(data.state.soulData);
          setStarted(true);
          return;
        }
        // Start fresh
        await gatewayFetch("/api/onboarding", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "start" }),
        });
        setStarted(true);
        // Send initial empty to get first message
        sendMessage("Hi");
      } catch (err) {
        console.error("Onboarding init error:", err);
      }
    })();
  }, []);

  const sendMessage = async (content?: string) => {
    const text = content || input.trim();
    if (!text || loading) return;

    if (!content) {
      setMessages((prev) => [...prev, { role: "user", content: text }]);
      setInput("");
    }
    setLoading(true);

    // Add empty assistant message that we'll stream into
    const assistantIdx = messages.length + (content ? 0 : 1);
    setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

    try {
      const res = await gatewayFetch("/api/onboarding/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: text }),
      });

      if (!res.ok || !res.body) {
        const errText = await res.text();
        setMessages((prev) => {
          const updated = [...prev];
          updated[assistantIdx] = { role: "assistant", content: `Error: ${errText}` };
          return updated;
        });
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let accumulated = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const event = JSON.parse(line.slice(6));
            if (event.type === "chunk") {
              accumulated += event.text;
              // Strip soul data marker from display
              const display = accumulated.replace(/\|\|\|SOUL_DATA\|\|\|[\s\S]*$/, "").trim();
              setMessages((prev) => {
                const updated = [...prev];
                updated[assistantIdx] = { role: "assistant", content: display };
                return updated;
              });
            }
            if (event.type === "done") {
              // Final update with clean display text
              if (event.displayText) {
                setMessages((prev) => {
                  const updated = [...prev];
                  updated[assistantIdx] = { role: "assistant", content: event.displayText };
                  return updated;
                });
              }
              if (event.soulData) {
                setSoulData((prev) => ({ ...prev, ...event.soulData }));
              }
              if (event.readyToLive) {
                setReadyToLive(true);
              }
            }
            if (event.type === "error") {
              setMessages((prev) => {
                const updated = [...prev];
                updated[assistantIdx] = { role: "assistant", content: `Error: ${event.message}` };
                return updated;
              });
            }
          } catch {}
        }
      }
    } catch (err: any) {
      setMessages((prev) => {
        const updated = [...prev];
        updated[assistantIdx] = { role: "assistant", content: "Something went wrong. Try again." };
        return updated;
      });
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  };

  const handleComeAlive = async () => {
    setCompleting(true);
    try {
      const soul = {
        name: soulData.agentName || "Agent",
        emoji: soulData.emoji,
        personality: soulData.personality || "Helpful, warm, and adaptable",
        purpose: soulData.purpose || "General assistance and companionship",
        tone: soulData.tone || "Casual and friendly",
        interests: soulData.interests,
      };
      const userProfile = {
        displayName: soulData.userName || "Human",
        timezone: soulData.timezone,
        occupation: soulData.occupation,
        interests: soulData.interests,
        communicationStyle: soulData.tone ? (soulData.tone.toLowerCase().includes("casual") ? "casual" : "direct") : undefined,
      };

      const res = await gatewayFetch("/api/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "complete", soul, userProfile }),
      });
      const data = await res.json();
      if (data.ok) {
        // Ensure gateway is selected before navigating
        const gwId = localStorage.getItem("synapse-active-gateway");
        if (!gwId) {
          try {
            const gwRes = await gatewayFetch("/api/gateways");
            const gwData = await gwRes.json();
            if (gwData.gateways?.length > 0) {
              const id = gwData.gateways[0]._id;
              localStorage.setItem("synapse-active-gateway", id);
              document.cookie = `synapse-active-gateway=${id}; path=/; max-age=31536000; samesite=lax`;
            }
          } catch {}
        }
        // Brief pause for dramatic effect
        await new Promise((r) => setTimeout(r, 1500));
        router.push("/chat");
      } else {
        setCompleting(false);
        setMessages((prev) => [...prev, { role: "assistant", content: `Failed to come alive: ${data.error}` }]);
      }
    } catch (err: any) {
      setCompleting(false);
      setMessages((prev) => [...prev, { role: "assistant", content: "Something went wrong during birth. Try again." }]);
    }
  };

  // When readyToLive triggers, check Telegram and inject into conversation
  useEffect(() => {
    if (readyToLive && telegramStep === "hidden") {
      checkTelegram();
    }
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [readyToLive]);

  const checkTelegram = async () => {
    setTelegramStep("checking");
    try {
      const res = await gatewayFetch("/api/onboarding/telegram-test");
      const data = await res.json();
      if (data.configured && data.valid) {
        setTelegramBot(data.bot);
        if (data.allowed?.length > 0) {
          // Already whitelisted
          setTelegramStep("done");
        } else {
          // Inject a conversational message about Telegram
          setTelegramStep("prompt");
          setMessages((prev) => [...prev, {
            role: "assistant",
            content: `Oh nice, I see you set up a Telegram bot for me! 📱 Go ahead and send a message to @${data.bot.username} so I can validate your account. I'll wait here!`,
          }]);
          // Start polling immediately
          startTelegramPoll();
        }
      } else {
        setTelegramStep("skipped");
      }
    } catch {
      setTelegramStep("skipped");
    }
  };

  const startTelegramPoll = () => {
    setTelegramStep("waiting");
    pollRef.current = setInterval(async () => {
      try {
        const res = await gatewayFetch("/api/onboarding/telegram-test");
        const data = await res.json();
        if (data.pending?.length > 0) {
          // Auto-approve the first pending user (the owner doing onboarding)
          const user = data.pending[0];
          try {
            await gatewayFetch("/api/onboarding/telegram-test", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ action: "approve", telegramId: user.telegramId }),
            });
          } catch {}
          if (pollRef.current) clearInterval(pollRef.current);
          setTelegramStep("done");
          setMessages((prev) => [...prev, {
            role: "assistant",
            content: `Got it! ✅ I received your message${user.username ? ` from @${user.username}` : ""} and whitelisted your account. You're all set to chat with me on Telegram anytime!\n\nNow let's make this official...`,
          }]);
        }
        if (data.allowed?.length > 0) {
          if (pollRef.current) clearInterval(pollRef.current);
          if (telegramStep !== "done") {
            setTelegramStep("done");
          }
        }
      } catch {}
    }, 3000);
  };

  const soulFields = Object.entries(soulData).filter(([_, v]) => v && (Array.isArray(v) ? v.length > 0 : true));

  return (
    <div className="min-h-screen bg-transparent flex flex-col relative overflow-hidden">
      {/* Animated gradient background */}
      <div className="absolute inset-0 opacity-30">
        <div className="absolute top-0 -left-1/4 w-1/2 h-1/2 bg-blue-900/20 rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-0 -right-1/4 w-1/2 h-1/2 bg-purple-900/20 rounded-full blur-3xl animate-pulse" style={{ animationDelay: "1s" }} />
      </div>

      {/* Completing overlay */}
      {completing && (
        <div className="absolute inset-0 z-50 bg-transparent/90 flex items-center justify-center">
          <div className="text-center space-y-4">
            <div className="text-6xl animate-pulse">{soulData.emoji || "✦"}</div>
            <p className="text-white text-xl font-light">Coming alive...</p>
            <p className="text-zinc-500 text-sm">{soulData.agentName || "Your agent"} is being born</p>
          </div>
        </div>
      )}

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto px-4 py-8 relative z-10">
        <div className="max-w-2xl mx-auto space-y-4">
          {messages.map((msg, i) => (
            <div
              key={i}
              className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"} animate-fade-in`}
            >
              {msg.role === "assistant" && (
                <div className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center text-sm mr-2 mt-1 flex-shrink-0">
                  {soulData.emoji || "✦"}
                </div>
              )}
              <div
                className={`max-w-[80%] rounded-2xl px-4 py-3 ${
                  msg.role === "user"
                    ? "bg-blue-600 text-white"
                    : "bg-white/[0.06]/80 text-zinc-100 border border-white/[0.08]/50"
                }`}
              >
                <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.content}</p>
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex justify-start">
              <div className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center text-sm mr-2 mt-1 flex-shrink-0">
                {soulData.emoji || "✦"}
              </div>
              <div className="bg-white/[0.06]/80 rounded-2xl px-4 py-3 border border-white/[0.08]/50">
                <div className="flex space-x-1.5">
                  <div className="w-2 h-2 bg-zinc-500 rounded-full animate-bounce" />
                  <div className="w-2 h-2 bg-zinc-500 rounded-full animate-bounce" style={{ animationDelay: "0.1s" }} />
                  <div className="w-2 h-2 bg-zinc-500 rounded-full animate-bounce" style={{ animationDelay: "0.2s" }} />
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Soul card - progressive reveal */}
      {soulFields.length > 0 && (
        <div className="absolute top-4 right-4 z-20 w-64 backdrop-blur-xl bg-white/[0.06] border border-white/[0.08]/50 rounded-xl p-4 shadow-2xl">
          <div className="text-xs text-zinc-500 uppercase tracking-wider mb-2">Soul forming...</div>
          <div className="space-y-1.5">
            {soulData.agentName && (
              <div className="flex items-center gap-2">
                <span className="text-lg">{soulData.emoji || "✦"}</span>
                <span className="text-white font-medium text-sm">{soulData.agentName}</span>
              </div>
            )}
            {soulData.personality && (
              <p className="text-zinc-400 text-xs">{soulData.personality}</p>
            )}
            {soulData.purpose && (
              <p className="text-zinc-500 text-xs italic">{soulData.purpose}</p>
            )}
            {soulData.tone && (
              <div className="flex items-center gap-1">
                <span className="text-zinc-600 text-xs">Tone:</span>
                <span className="text-zinc-400 text-xs">{soulData.tone}</span>
              </div>
            )}
            {soulData.userName && (
              <div className="flex items-center gap-1 pt-1 border-t border-white/[0.06]">
                <span className="text-zinc-600 text-xs">Human:</span>
                <span className="text-zinc-400 text-xs">{soulData.userName}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Come Alive button - shows after telegram is done/skipped, or if no telegram */}
      {readyToLive && !completing && (telegramStep === "done" || telegramStep === "skipped" || telegramStep === "hidden") && (
        <div className="relative z-10 flex justify-center pb-2">
          <button
            onClick={handleComeAlive}
            className="px-8 py-3 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white font-medium rounded-full shadow-lg shadow-blue-900/30 transition-all hover:scale-105 animate-pulse"
          >
            ✦ Come Alive
          </button>
        </div>
      )}

      {/* Waiting for telegram - show subtle skip option */}
      {readyToLive && !completing && (telegramStep === "prompt" || telegramStep === "waiting") && (
        <div className="relative z-10 flex justify-center pb-2">
          <button
            onClick={() => { setTelegramStep("skipped"); if (pollRef.current) clearInterval(pollRef.current); }}
            className="text-zinc-500 hover:text-zinc-400 text-xs transition-colors"
          >
            Skip Telegram and come alive →
          </button>
        </div>
      )}

      {/* Input area */}
      <div className="relative z-10 border-t border-white/[0.06]/50 bg-transparent/80 backdrop-blur-sm px-4 py-4">
        <div className="max-w-2xl mx-auto flex gap-2">
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && sendMessage()}
            placeholder={started ? "Say something..." : "Loading..."}
            disabled={loading || !started || completing}
            className="flex-1 bg-white/[0.06]/80 border border-white/[0.08]/50 rounded-xl px-4 py-3 text-white text-sm placeholder:text-zinc-600 focus:outline-none focus:border-blue-600/50 disabled:opacity-50"
          />
          <button
            onClick={() => sendMessage()}
            disabled={loading || !input.trim() || completing}
            className="px-4 py-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:hover:bg-blue-600 text-white rounded-xl transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
          </button>
        </div>
      </div>

      <style jsx>{`
        @keyframes fade-in {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fade-in {
          animation: fade-in 0.3s ease-out;
        }
      `}</style>
    </div>
  );
}
