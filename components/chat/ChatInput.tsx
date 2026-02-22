"use client";
import { gatewayFetch } from "@/lib/gatewayFetch";

import { useState, useRef, useEffect, useCallback } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Send, Square, X, Paperclip, FileIcon, Loader2, Mic, MicOff, Bot, ChevronDown, Clock, Volume2 } from "lucide-react";
import { toast } from "sonner";
import { useSession } from "next-auth/react";
import { getCommandSuggestions } from "@/lib/slashCommands";

export function ChatInput({ sessionId }: { sessionId: string }) {
  const [content, setContent] = useState("");
  const [sending, setSending] = useState(false);
  const [suggestions, setSuggestions] = useState<Array<{ name: string; description: string; usage: string }>>([]);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [attachedFile, setAttachedFile] = useState<{ file: File; preview?: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [recording, setRecording] = useState(false);
  const [showScheduler, setShowScheduler] = useState(false);
  const [scheduleDate, setScheduleDate] = useState("");
  const [scheduleTime, setScheduleTime] = useState("");
  const [transcribing, setTranscribing] = useState(false);
  const [voiceMode, setVoiceMode] = useState(false);
  const [voiceAwaitingReply, setVoiceAwaitingReply] = useState(false);
  const [voiceSettings, setVoiceSettings] = useState({
    autoRead: true,
    autoTranscribe: true,
    maxTextLength: 5000,
  });
  const [agents, setAgents] = useState<Array<{ _id: string; name: string; slug: string; isActive: boolean }>>([]);
  const [currentAgentId, setCurrentAgentId] = useState<string | null>(null);
  const [showAgentPicker, setShowAgentPicker] = useState(false);
  const agentPickerRef = useRef<HTMLDivElement>(null);
  const { data: authSession } = useSession();
  const gatewayId = (authSession?.user as any)?.gatewayId;
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const activeAudioRef = useRef<HTMLAudioElement | null>(null);
  const voiceModeRef = useRef(false);
  const voiceAwaitingReplyRef = useRef(false);

  const chatState = typeof window !== "undefined" ? (window as any).__synapse_chat : null;
  const isStreaming = chatState?.isStreaming || false;
  const isDisabled = sending || isStreaming;

  useEffect(() => {
    voiceModeRef.current = voiceMode;
  }, [voiceMode]);

  useEffect(() => {
    voiceAwaitingReplyRef.current = voiceAwaitingReply;
  }, [voiceAwaitingReply]);

  useEffect(() => {
    textareaRef.current?.focus();
  }, [sessionId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await gatewayFetch("/api/config/bulk?keys=voice.auto_read,voice.auto_transcribe,voice.max_text_length");
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        const maxTextRaw = Number.parseInt(data["voice.max_text_length"] || "", 10);
        setVoiceSettings({
          autoRead: data["voice.auto_read"] !== "false",
          autoTranscribe: data["voice.auto_transcribe"] !== "false",
          maxTextLength: Number.isFinite(maxTextRaw) && maxTextRaw > 0 ? maxTextRaw : 5000,
        });
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [gatewayId]);

  // Fetch agents list and current session agent
  useEffect(() => {
    if (!gatewayId) return;
    (async () => {
      try {
        const [agentsRes, sessionRes] = await Promise.all([
          gatewayFetch(`/api/agents?gatewayId=${gatewayId}`),
          gatewayFetch(`/api/sessions/${sessionId}`),
        ]);
        if (agentsRes.ok) {
          const data = await agentsRes.json();
          setAgents(Array.isArray(data) ? data : data.agents || []);
        }
        if (sessionRes.ok) {
          const session = await sessionRes.json();
          if (session.agentId) setCurrentAgentId(session.agentId);
        }
      } catch {}
    })();
  }, [gatewayId, sessionId]);

  // Close agent picker on outside click
  useEffect(() => {
    if (!showAgentPicker) return;
    const handler = (e: MouseEvent) => {
      if (agentPickerRef.current && !agentPickerRef.current.contains(e.target as Node)) setShowAgentPicker(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showAgentPicker]);

  const switchAgent = useCallback(async (agentId: string) => {
    try {
      await gatewayFetch(`/api/sessions/${sessionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentId }),
      });
      setCurrentAgentId(agentId);
      setShowAgentPicker(false);
      toast.success("Agent switched");
    } catch {
      toast.error("Failed to switch agent");
    }
  }, [sessionId]);

  // Listen for file drop insertion
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.ref) {
        setContent(prev => prev ? `${detail.ref}\n${prev}` : detail.ref);
        setTimeout(() => textareaRef.current?.focus(), 100);
      }
    };
    window.addEventListener("synapse:insert-file", handler);
    return () => window.removeEventListener("synapse:insert-file", handler);
  }, []);

  // Listen for cross-channel quote injection
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.text && detail?.sourceChannel) {
        const quote = `> From #${detail.sourceChannel}:\n> ${detail.text.split("\n").join("\n> ")}\n\n`;
        setContent(quote);
        setTimeout(() => textareaRef.current?.focus(), 100);
      }
    };
    window.addEventListener("synapse:inject-quote", handler);
    return () => window.removeEventListener("synapse:inject-quote", handler);
  }, []);

  // Update suggestions when content changes
  useEffect(() => {
    if (content.startsWith("/") && !content.includes(" ")) {
      const results = getCommandSuggestions(content);
      setSuggestions(results);
      setShowSuggestions(results.length > 0);
      setSelectedIdx(0);
    } else {
      setShowSuggestions(false);
      setSuggestions([]);
    }
  }, [content]);

  const selectSuggestion = useCallback((suggestion: { name: string; usage: string }) => {
    // If the command takes args, add a space; otherwise just set the command
    const hasArgs = suggestion.usage.includes("<");
    setContent(`/${suggestion.name}${hasArgs ? " " : ""}`);
    setShowSuggestions(false);
    textareaRef.current?.focus();
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 25 * 1024 * 1024) {
      toast.error("File too large (max 25MB)");
      return;
    }
    let preview: string | undefined;
    if (file.type.startsWith("image/")) {
      preview = URL.createObjectURL(file);
    }
    setAttachedFile({ file, preview });
    e.target.value = "";
  };

  const removeAttachment = () => {
    if (attachedFile?.preview) URL.revokeObjectURL(attachedFile.preview);
    setAttachedFile(null);
  };

  const uploadFile = async (file: File): Promise<{ id: string; filename: string } | null> => {
    const cs = (window as any).__synapse_chat;
    const gatewayId = cs?.gatewayId;
    if (!gatewayId) return null;
    const formData = new FormData();
    formData.append("file", file);
    formData.append("gatewayId", gatewayId);
    if (sessionId) formData.append("sessionId", sessionId);
    const res = await gatewayFetch("/api/files/upload", { method: "POST", body: formData });
    if (!res.ok) throw new Error("Upload failed");
    return await res.json();
  };

  const handleSchedule = async () => {
    if (!content.trim() || !scheduleDate || !scheduleTime) {
      toast.error("Enter a message, date, and time");
      return;
    }
    const scheduledFor = new Date(`${scheduleDate}T${scheduleTime}`).getTime();
    if (scheduledFor <= Date.now()) {
      toast.error("Scheduled time must be in the future");
      return;
    }
    try {
      const res = await gatewayFetch("/api/scheduled-messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, content: content.trim(), scheduledFor }),
      });
      if (res.ok) {
        toast.success(`Message scheduled for ${new Date(scheduledFor).toLocaleString()}`);
        setContent(""); setShowScheduler(false); setScheduleDate(""); setScheduleTime("");
      }
    } catch { toast.error("Failed to schedule message"); }
  };

  const handleSend = async () => {
    const trimmed = content.trim();
    if ((!trimmed && !attachedFile) || isDisabled) return;

    const fileToUpload = attachedFile;
    setSending(true);
    setContent("");
    setShowSuggestions(false);
    setAttachedFile(null);

    try {
      const sendMessage = (window as any).__synapse_chat?.sendMessage;
      console.log("[ChatInput] __synapse_chat:", { hasSendMessage: !!sendMessage, isStreaming: (window as any).__synapse_chat?.isStreaming });
      if (!sendMessage) throw new Error("Chat not initialized");

      let messageToSend = trimmed;

      if (fileToUpload) {
        setUploading(true);
        try {
          const uploaded = await uploadFile(fileToUpload.file);
          if (uploaded) {
            const fileRef = `[file:${uploaded.id}:${uploaded.filename}]`;
            messageToSend = messageToSend ? `${fileRef}\n${messageToSend}` : fileRef;
          }
        } finally {
          setUploading(false);
          if (fileToUpload.preview) URL.revokeObjectURL(fileToUpload.preview);
        }
      }

      if (!messageToSend) return;

      const result = await sendMessage(messageToSend);

      // new_session action no longer used - single session per user
    } catch (err: any) {
      toast.error(err.message || "Failed to send message");
      setContent(trimmed);
    } finally {
      setSending(false);
      // Delay focus to ensure React has re-rendered after state updates
      requestAnimationFrame(() => {
        textareaRef.current?.focus();
      });
    }
  };

  const handleStop = () => {
    (window as any).__synapse_chat?.stopStreaming?.();
  };

  const sendTextDirect = useCallback(async (text: string) => {
    const sendMessage = (window as any).__synapse_chat?.sendMessage;
    if (!sendMessage) throw new Error("Chat not initialized");
    await sendMessage(text);
  }, []);

  const playTts = useCallback(async (text: string) => {
    const response = await gatewayFetch("/api/voice/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: text.slice(0, voiceSettings.maxTextLength) }),
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || "TTS failed");
    }

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    await new Promise<void>((resolve, reject) => {
      const audio = new Audio(url);
      activeAudioRef.current = audio;
      audio.onended = () => {
        URL.revokeObjectURL(url);
        activeAudioRef.current = null;
        resolve();
      };
      audio.onerror = () => {
        URL.revokeObjectURL(url);
        activeAudioRef.current = null;
        reject(new Error("Audio playback failed"));
      };
      audio.play().catch(reject);
    });
  }, [voiceSettings.maxTextLength]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && recording) {
      mediaRecorderRef.current.stop();
      setRecording(false);
    }
  }, [recording]);

  const startRecording = useCallback(async (autoSend = false) => {
    if (recording || transcribing || isDisabled) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" : "audio/webm";
      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blobType = mediaRecorder.mimeType || "audio/webm";
        const ext = blobType.includes("ogg") ? "ogg" : blobType.includes("wav") ? "wav" : "webm";
        const audioBlob = new Blob(audioChunksRef.current, { type: blobType });
        if (audioBlob.size < 100) return;

        setTranscribing(true);
        try {
          const formData = new FormData();
          formData.append("audio", audioBlob, `recording.${ext}`);
          const res = await gatewayFetch("/api/voice/stt", { method: "POST", body: formData });
          if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            throw new Error(errData.error || "Transcription failed");
          }
          const { text } = await res.json();
          const transcript = (text || "").trim();
          if (!transcript) return;

          if (autoSend) {
            if (!voiceModeRef.current) return;
            setVoiceAwaitingReply(true);
            await sendTextDirect(transcript);
          } else {
            setContent((prev) => (prev ? `${prev} ${transcript}` : transcript));
          }
        } catch (err: any) {
          toast.error("Voice transcription failed: " + (err.message || "unknown error"));
          if (autoSend) setVoiceAwaitingReply(false);
        } finally {
          setTranscribing(false);
        }
      };

      mediaRecorder.start();
      setRecording(true);
    } catch {
      toast.error("Microphone access denied");
    }
  }, [isDisabled, recording, sendTextDirect, transcribing]);

  const toggleVoiceMode = useCallback(async () => {
    if (voiceModeRef.current) {
      setVoiceMode(false);
      setVoiceAwaitingReply(false);
      stopRecording();
      if (activeAudioRef.current) {
        activeAudioRef.current.pause();
        activeAudioRef.current = null;
      }
      toast.success("Voice mode off");
      return;
    }

    setVoiceMode(true);
    setVoiceAwaitingReply(false);
    toast.success("Voice mode on");

    if (voiceSettings.autoTranscribe && !isDisabled && !recording && !transcribing) {
      await startRecording(true);
    }
  }, [isDisabled, recording, startRecording, stopRecording, transcribing, voiceSettings.autoTranscribe]);

  // Voice mode turn-taking: when a new assistant message arrives, speak it then listen again.
  useEffect(() => {
    const handler = async (event: Event) => {
      const detail = (event as CustomEvent).detail as { content?: string; sessionId?: string } | undefined;
      if (!detail?.content) return;
      if (detail.sessionId && detail.sessionId !== sessionId) return;
      if (!voiceModeRef.current || !voiceAwaitingReplyRef.current) return;

      setVoiceAwaitingReply(false);
      if (voiceSettings.autoRead) {
        try {
          await playTts(detail.content);
        } catch (err: any) {
          toast.error("Voice playback failed: " + (err.message || "unknown error"));
        }
      }

      if (voiceModeRef.current && !isDisabled && voiceSettings.autoTranscribe) {
        await startRecording(true);
      }
    };

    window.addEventListener("synapse:assistant_message", handler);
    return () => window.removeEventListener("synapse:assistant_message", handler);
  }, [isDisabled, playTts, sessionId, startRecording, voiceSettings.autoRead, voiceSettings.autoTranscribe]);

  useEffect(() => {
    return () => {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
        mediaRecorderRef.current.stop();
      }
      if (activeAudioRef.current) {
        activeAudioRef.current.pause();
        activeAudioRef.current = null;
      }
    };
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (showSuggestions) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIdx((i) => Math.min(i + 1, suggestions.length - 1));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIdx((i) => Math.max(i - 1, 0));
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        if (suggestions[selectedIdx]) {
          selectSuggestion(suggestions[selectedIdx]);
        }
        return;
      }
      if (e.key === "Escape") {
        setShowSuggestions(false);
        return;
      }
    }

    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="border-t border-white/[0.06] p-2 sm:p-5 pb-[calc(0.5rem+env(safe-area-inset-bottom))] sm:pb-[calc(0.75rem+env(safe-area-inset-bottom))] bg-white/[0.02] backdrop-blur-2xl">
      <div className="relative">
        {showSuggestions && (
          <div className="absolute bottom-full left-0 mb-2 w-80 rounded-xl border border-white/[0.12] bg-white/[0.07] backdrop-blur-3xl shadow-[0_16px_64px_rgba(0,0,0,0.4)] overflow-hidden z-10">
            {suggestions.map((s, i) => (
              <button
                key={s.name}
                className={`w-full text-left px-3 py-2 text-sm flex items-center gap-2 hover:bg-accent/50 transition-colors ${
                  i === selectedIdx ? "bg-accent/50" : ""
                }`}
                onClick={() => selectSuggestion(s)}
                onMouseEnter={() => setSelectedIdx(i)}
              >
                <span className="font-mono text-primary">/{s.name}</span>
                <span className="text-muted-foreground truncate">{s.description}</span>
              </button>
            ))}
          </div>
        )}

        {/* File attachment preview */}
        {attachedFile && (
          <div className="mb-3 flex items-center gap-3 rounded-xl border border-white/[0.08] bg-white/[0.04] backdrop-blur-2xl px-4 py-3">
            {attachedFile.preview ? (
              <img src={attachedFile.preview} alt="Preview" className="h-12 w-12 rounded object-cover" />
            ) : (
              <FileIcon className="h-5 w-5 text-zinc-400" />
            )}
            <span className="text-sm text-zinc-300 truncate flex-1">{attachedFile.file.name}</span>
            <span className="text-xs text-zinc-500">{(attachedFile.file.size / 1024).toFixed(0)}KB</span>
            <button onClick={removeAttachment} aria-label="Remove attachment" className="p-1 rounded hover:bg-white/10 text-zinc-500 hover:text-zinc-300 transition shrink-0">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          accept="image/*,application/pdf,text/*,.json,.csv,.md,.py,.js,.ts,.tsx,.jsx"
          onChange={handleFileSelect}
        />

        {/* Agent persona quick-switch */}
        {agents.length > 1 && (
          <div ref={agentPickerRef} className="relative mb-2">
            <button
              onClick={() => setShowAgentPicker(!showAgentPicker)}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/[0.04] border border-white/[0.08] text-xs text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.06] transition-colors"
            >
              <Bot className="h-3 w-3" />
              <span>{agents.find((a) => a._id === currentAgentId)?.name || "Agent"}</span>
              <ChevronDown className="h-3 w-3" />
            </button>
            {showAgentPicker && (
              <div className="absolute bottom-full left-0 mb-1 w-48 rounded-xl border border-white/[0.12] bg-white/[0.07] backdrop-blur-3xl shadow-lg overflow-hidden z-10">
                {agents.filter((a) => a.isActive).map((agent) => (
                  <button
                    key={agent._id}
                    onClick={() => switchAgent(agent._id)}
                    className={`w-full text-left px-3 py-2 text-xs flex items-center gap-2 hover:bg-white/[0.06] transition-colors ${agent._id === currentAgentId ? "text-blue-400 bg-white/[0.04]" : "text-zinc-300"}`}
                  >
                    <Bot className="h-3 w-3" />
                    <span>{agent.name}</span>
                    {agent._id === currentAgentId && <span className="ml-auto text-[10px] text-blue-400">active</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="flex gap-1.5 sm:gap-2">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="shrink-0 self-end min-w-[44px] min-h-[44px] text-zinc-400 hover:text-zinc-200"
            onClick={() => fileInputRef.current?.click()}
            disabled={isDisabled || uploading}
            aria-label="Attach file"
          >
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={`shrink-0 self-end min-w-[44px] min-h-[44px] ${voiceMode ? "text-emerald-400" : "text-zinc-400 hover:text-zinc-200"}`}
            onClick={toggleVoiceMode}
            disabled={transcribing || uploading}
            aria-label={voiceMode ? "Disable voice conversation mode" : "Enable voice conversation mode"}
            title={voiceMode ? "Voice conversation: on" : "Voice conversation: off"}
          >
            {voiceMode ? <Volume2 className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={`shrink-0 self-end min-w-[44px] min-h-[44px] hidden sm:inline-flex ${recording ? "text-red-400 animate-pulse" : "text-zinc-400 hover:text-zinc-200"}`}
            onMouseDown={() => { void startRecording(false); }}
            onMouseUp={stopRecording}
            onMouseLeave={() => recording && stopRecording()}
            onTouchStart={() => { void startRecording(false); }}
            onTouchEnd={stopRecording}
            disabled={isDisabled || transcribing}
            aria-label={recording ? "Stop recording" : "Hold to record voice"}
            title="Hold to record voice"
          >
            {transcribing ? <Loader2 className="h-4 w-4 animate-spin" /> : recording ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
          </Button>
          <div className="relative shrink-0 self-end hidden sm:block">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className={`min-w-[44px] min-h-[44px] text-zinc-400 hover:text-zinc-200 ${showScheduler ? "text-blue-400" : ""}`}
              onClick={() => setShowScheduler(!showScheduler)}
              disabled={isDisabled}
              aria-label="Schedule message"
              title="Schedule message"
            >
              <Clock className="h-4 w-4" />
            </Button>
            {showScheduler && (
              <div role="dialog" aria-label="Schedule message" className="absolute bottom-12 left-0 z-50 rounded-xl border border-white/10 bg-zinc-900/95 backdrop-blur-xl p-3 shadow-xl w-64 space-y-2">
                <p className="text-xs font-medium text-zinc-300">Schedule Message</p>
                <label className="sr-only" htmlFor="schedule-date">Date</label>
                <input id="schedule-date" type="date" value={scheduleDate} onChange={(e) => setScheduleDate(e.target.value)}
                  className="w-full rounded-lg bg-white/[0.07] border border-white/10 px-2 py-1.5 text-xs text-zinc-200" />
                <label className="sr-only" htmlFor="schedule-time">Time</label>
                <input id="schedule-time" type="time" value={scheduleTime} onChange={(e) => setScheduleTime(e.target.value)}
                  className="w-full rounded-lg bg-white/[0.07] border border-white/10 px-2 py-1.5 text-xs text-zinc-200" />
                <Button onClick={handleSchedule} size="sm" className="w-full bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-lg text-xs">
                  Schedule
                </Button>
              </div>
            )}
          </div>
          <Textarea
            ref={textareaRef}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message..."
            className="min-h-[44px] max-h-32 resize-none bg-card text-base sm:text-sm"
            rows={1}
          />
          {isStreaming ? (
            <Button
              onClick={handleStop}
              size="icon"
              variant="destructive"
              className="shrink-0 self-end min-w-[44px] min-h-[44px]"
              aria-label="Stop streaming"
            >
              <Square className="h-4 w-4" />
            </Button>
          ) : (
            <Button
              onClick={handleSend}
              disabled={isDisabled || !content.trim()}
              size="icon"
              className="shrink-0 self-end min-w-[44px] min-h-[44px]"
              aria-label="Send message"
            >
              <Send className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
