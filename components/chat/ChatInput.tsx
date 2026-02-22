"use client";
import { gatewayFetch } from "@/lib/gatewayFetch";

import { useState, useRef, useEffect, useCallback } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Send, Square, X, Paperclip, FileIcon, Loader2, Mic, MicOff, Bot, ChevronDown, Clock, Volume2 } from "lucide-react";
import { toast } from "sonner";
import { useSession } from "next-auth/react";
import { getCommandSuggestions } from "@/lib/slashCommands";

type BrowserSpeechRecognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: any) => void) | null;
  onerror: ((event: any) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

type BrowserSpeechRecognitionCtor = new () => BrowserSpeechRecognition;

export function ChatInput({ sessionId }: { sessionId: string }) {
  const [content, setContent] = useState("");
  const [sending, setSending] = useState(false);
  const [chatStreaming, setChatStreaming] = useState(false);
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
  const [ttsPlaying, setTtsPlaying] = useState(false);
  const [voiceSettings, setVoiceSettings] = useState({
    autoRead: true,
    streamTts: true,
    bargeIn: true,
    autoTranscribe: true,
    maxTextLength: 5000,
    sttProvider: "groq",
    sttLanguage: "en-US",
    ttsSpeed: 1.2,
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
  const speechRecognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const activeAudioRef = useRef<HTMLAudioElement | null>(null);
  const voiceModeRef = useRef(false);
  const voiceAwaitingReplyRef = useRef(false);
  const recordingRef = useRef(false);
  const transcribingRef = useRef(false);
  const ttsPlayingRef = useRef(false);
  const chatStreamingRef = useRef(false);
  const awaitingReplyTimerRef = useRef<number | null>(null);
  const awaitingSinceRef = useRef(0);
  const streamSpeechBufferRef = useRef("");
  const streamSpeechQueueRef = useRef<string[]>([]);
  const streamSpeechLoopActiveRef = useRef(false);
  const streamSpeechUsedRef = useRef(false);
  const bargeInMonitorStreamRef = useRef<MediaStream | null>(null);
  const bargeInMonitorAudioCtxRef = useRef<AudioContext | null>(null);
  const bargeInMonitorFrameRef = useRef<number | null>(null);
  const bargeInCooldownRef = useRef(0);
  const sessionIdRef = useRef(sessionId);
  const voiceSettingsRef = useRef(voiceSettings);
  const playTtsRef = useRef<(text: string) => Promise<void>>(async () => {});
  const startRecordingRef = useRef<(autoSend?: boolean) => Promise<void>>(async () => {});
  const waitForChatIdleRef = useRef<(timeoutMs?: number) => Promise<boolean>>(async () => true);

  const isDisabled = sending || chatStreaming;

  useEffect(() => {
    voiceModeRef.current = voiceMode;
  }, [voiceMode]);

  useEffect(() => {
    voiceAwaitingReplyRef.current = voiceAwaitingReply;
  }, [voiceAwaitingReply]);

  useEffect(() => {
    recordingRef.current = recording;
  }, [recording]);

  useEffect(() => {
    transcribingRef.current = transcribing;
  }, [transcribing]);

  useEffect(() => {
    ttsPlayingRef.current = ttsPlaying;
  }, [ttsPlaying]);

  useEffect(() => {
    sessionIdRef.current = sessionId;
  }, [sessionId]);

  useEffect(() => {
    voiceSettingsRef.current = voiceSettings;
  }, [voiceSettings]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const sync = () => {
      const next = Boolean((window as any).__synapse_chat?.isStreaming);
      chatStreamingRef.current = next;
      setChatStreaming((prev) => (prev === next ? prev : next));
    };
    sync();
    const interval = window.setInterval(sync, 150);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    textareaRef.current?.focus();
  }, [sessionId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await gatewayFetch("/api/config/bulk?keys=voice.auto_read,voice.stream_tts,voice.barge_in,voice.auto_transcribe,voice.max_text_length,voice.stt_provider,voice.stt_language,voice.tts_speed,voice.speed");
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        const maxTextRaw = Number.parseInt(data["voice.max_text_length"] || "", 10);
        const sttProviderRaw = String(data["voice.stt_provider"] || "groq").toLowerCase();
        const ttsSpeedRaw = Number.parseFloat(String(data["voice.tts_speed"] || data["voice.speed"] || "1.2"));
        setVoiceSettings({
          autoRead: data["voice.auto_read"] !== "false",
          streamTts: data["voice.stream_tts"] !== "false",
          bargeIn: data["voice.barge_in"] !== "false",
          autoTranscribe: data["voice.auto_transcribe"] !== "false",
          maxTextLength: Number.isFinite(maxTextRaw) && maxTextRaw > 0 ? maxTextRaw : 5000,
          sttProvider: sttProviderRaw || "groq",
          sttLanguage: data["voice.stt_language"] || navigator.language || "en-US",
          ttsSpeed: Number.isFinite(ttsSpeedRaw) ? Math.max(0.7, Math.min(2, ttsSpeedRaw)) : 1.2,
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
    const sendMessage = (window as any).__synapse_chat?.sendMessage;
    if (!sendMessage) { toast.error("Chat not initialized"); return; }

    // Clear input immediately so user can keep typing
    setContent("");
    setShowSuggestions(false);
    setAttachedFile(null);

    let messageToSend = trimmed;

    // Upload file first (UI stays interactive, just shows uploading indicator)
    if (fileToUpload) {
      setUploading(true);
      try {
        const uploaded = await uploadFile(fileToUpload.file);
        if (uploaded) {
          const fileRef = `[file:${uploaded.id}:${uploaded.filename}]`;
          messageToSend = messageToSend ? `${fileRef}\n${messageToSend}` : fileRef;
        }
      } catch (err: any) {
        toast.error("Failed to upload file");
        setContent(trimmed);
        setAttachedFile(fileToUpload);
        setUploading(false);
        return;
      } finally {
        setUploading(false);
        if (fileToUpload.preview) URL.revokeObjectURL(fileToUpload.preview);
      }
    }

    if (!messageToSend) return;

    // Now send the message
    setSending(true);
    try {
      await sendMessage(messageToSend);
    } catch (err: any) {
      toast.error(err.message || "Failed to send message");
      setContent(trimmed);
    } finally {
      setSending(false);
      requestAnimationFrame(() => {
        textareaRef.current?.focus();
      });
    }
  };

  const handleStop = () => {
    void (async () => {
      await interruptAssistantTurn();
      if (voiceModeRef.current && voiceSettingsRef.current.autoTranscribe) {
        window.setTimeout(() => {
          if (voiceModeRef.current) void startRecordingRef.current(true);
        }, 200);
      }
    })();
  };

  const sendTextDirect = useCallback(async (text: string) => {
    const sendMessage = (window as any).__synapse_chat?.sendMessage;
    if (!sendMessage) throw new Error("Chat not initialized");
    await sendMessage(text);
  }, []);

  const isChatStreamingNow = useCallback(() => {
    if (typeof window === "undefined") return false;
    return Boolean((window as any).__synapse_chat?.isStreaming);
  }, []);

  const isAssistantBusyNow = useCallback(() => {
    return (
      isChatStreamingNow() ||
      ttsPlayingRef.current ||
      Boolean(activeAudioRef.current) ||
      streamSpeechLoopActiveRef.current
    );
  }, [isChatStreamingNow]);

  const waitForChatIdle = useCallback(async (timeoutMs = 6000) => {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
      if (!isChatStreamingNow()) return true;
      await new Promise((resolve) => setTimeout(resolve, 120));
    }
    return !isChatStreamingNow();
  }, [isChatStreamingNow]);

  const stopBargeInMonitor = useCallback(() => {
    if (typeof window !== "undefined" && bargeInMonitorFrameRef.current != null) {
      window.cancelAnimationFrame(bargeInMonitorFrameRef.current);
      bargeInMonitorFrameRef.current = null;
    }
    if (bargeInMonitorAudioCtxRef.current) {
      void bargeInMonitorAudioCtxRef.current.close().catch(() => {});
      bargeInMonitorAudioCtxRef.current = null;
    }
    if (bargeInMonitorStreamRef.current) {
      bargeInMonitorStreamRef.current.getTracks().forEach((t) => t.stop());
      bargeInMonitorStreamRef.current = null;
    }
  }, []);

  const resetLiveSpeechState = useCallback(() => {
    streamSpeechBufferRef.current = "";
    streamSpeechQueueRef.current = [];
    streamSpeechLoopActiveRef.current = false;
    streamSpeechUsedRef.current = false;
  }, []);

  const splitSpeakableChunks = useCallback((value: string): { chunks: string[]; remainder: string } => {
    const chunks: string[] = [];
    const regex = /([.!?]+(?:["')\]]+)?\s+|[,;:]\s+|\n{2,})/g;
    let cursor = 0;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(value)) !== null) {
      const end = regex.lastIndex;
      const rawChunk = value.slice(cursor, end).trim();
      if (rawChunk.length > 1) chunks.push(rawChunk);
      cursor = end;
    }
    let remainder = value.slice(cursor);
    const MAX_PENDING_CHARS = 90;
    if (remainder.length >= MAX_PENDING_CHARS) {
      const lastWhitespace = Math.max(remainder.lastIndexOf(" "), remainder.lastIndexOf("\n"));
      const splitAt = lastWhitespace > 40 ? lastWhitespace : MAX_PENDING_CHARS;
      const earlyChunk = remainder.slice(0, splitAt).trim();
      if (earlyChunk.length > 1) chunks.push(earlyChunk);
      remainder = remainder.slice(splitAt);
    }
    return { chunks, remainder };
  }, []);

  const runLiveSpeechQueue = useCallback(async () => {
    if (streamSpeechLoopActiveRef.current) return;
    streamSpeechLoopActiveRef.current = true;
    try {
      while (voiceModeRef.current && streamSpeechQueueRef.current.length > 0) {
        const next = streamSpeechQueueRef.current.shift();
        if (!next) continue;
        await playTtsRef.current(next);
      }
    } finally {
      streamSpeechLoopActiveRef.current = false;
    }
  }, []);

  const waitForLiveSpeechDrain = useCallback(async (timeoutMs = 20000) => {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
      if (!streamSpeechLoopActiveRef.current && streamSpeechQueueRef.current.length === 0) return true;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    return !streamSpeechLoopActiveRef.current && streamSpeechQueueRef.current.length === 0;
  }, []);

  const enqueueLiveSpeechChunks = useCallback((chunks: string[]) => {
    if (chunks.length === 0) return;
    streamSpeechUsedRef.current = true;
    streamSpeechQueueRef.current.push(...chunks);
    void runLiveSpeechQueue();
  }, [runLiveSpeechQueue]);

  const clearAwaitingReply = useCallback(() => {
    if (typeof window !== "undefined" && awaitingReplyTimerRef.current != null) {
      window.clearTimeout(awaitingReplyTimerRef.current);
      awaitingReplyTimerRef.current = null;
    }
    awaitingSinceRef.current = 0;
    voiceAwaitingReplyRef.current = false;
    setVoiceAwaitingReply(false);
  }, []);

  const markAwaitingReply = useCallback(() => {
    resetLiveSpeechState();
    if (typeof window !== "undefined") {
      if (awaitingReplyTimerRef.current != null) {
        window.clearTimeout(awaitingReplyTimerRef.current);
      }
      awaitingReplyTimerRef.current = window.setTimeout(() => {
        voiceAwaitingReplyRef.current = false;
        setVoiceAwaitingReply(false);
        awaitingReplyTimerRef.current = null;
      }, 20000);
    }
    awaitingSinceRef.current = Date.now();
    voiceAwaitingReplyRef.current = true;
    setVoiceAwaitingReply(true);
  }, [resetLiveSpeechState]);

  const interruptAssistantTurn = useCallback(async () => {
    (window as any).__synapse_chat?.stopStreaming?.();
    if (activeAudioRef.current) {
      activeAudioRef.current.pause();
      activeAudioRef.current = null;
    }
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    setTtsPlaying(false);
    clearAwaitingReply();
    resetLiveSpeechState();
    await waitForChatIdle(2500);
  }, [clearAwaitingReply, resetLiveSpeechState, waitForChatIdle]);

  const playBrowserTts = useCallback(async (text: string) => {
    const spokenText = text.slice(0, voiceSettings.maxTextLength).trim();
    if (!spokenText) return;
    if (typeof window === "undefined" || !("speechSynthesis" in window) || typeof SpeechSynthesisUtterance === "undefined") {
      throw new Error("Browser speech synthesis is not supported in this browser.");
    }

    const synth = window.speechSynthesis;
    synth.cancel();
    setTtsPlaying(true);

    await new Promise<void>((resolve, reject) => {
      const utterance = new SpeechSynthesisUtterance(spokenText);
      utterance.lang = voiceSettings.sttLanguage || navigator.language || "en-US";
      utterance.rate = Math.max(0.7, Math.min(2, voiceSettings.ttsSpeed || 1.2));
      utterance.onend = () => {
        setTtsPlaying(false);
        resolve();
      };
      utterance.onerror = () => {
        setTtsPlaying(false);
        reject(new Error("Browser speech playback failed"));
      };
      synth.speak(utterance);
    });
  }, [voiceSettings.maxTextLength, voiceSettings.sttLanguage, voiceSettings.ttsSpeed]);

  const playTts = useCallback(async (text: string) => {
    const spokenText = text.slice(0, voiceSettings.maxTextLength).trim();
    if (!spokenText) return;

    try {
      const response = await gatewayFetch("/api/voice/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: spokenText }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "TTS failed");
      }

      const blob = await response.blob();
      if (!blob.size) throw new Error("TTS returned empty audio");
      const url = URL.createObjectURL(blob);
      setTtsPlaying(true);
      await new Promise<void>((resolve, reject) => {
        const audio = new Audio(url);
        activeAudioRef.current = audio;
        audio.playbackRate = Math.max(0.7, Math.min(2, voiceSettings.ttsSpeed || 1.2));
        audio.onended = () => {
          URL.revokeObjectURL(url);
          activeAudioRef.current = null;
          setTtsPlaying(false);
          resolve();
        };
        audio.onerror = () => {
          URL.revokeObjectURL(url);
          activeAudioRef.current = null;
          setTtsPlaying(false);
          reject(new Error("Audio playback failed"));
        };
        audio.play().catch((err) => {
          URL.revokeObjectURL(url);
          activeAudioRef.current = null;
          setTtsPlaying(false);
          reject(err);
        });
      });
    } catch {
      await playBrowserTts(spokenText);
    }
  }, [playBrowserTts, voiceSettings.maxTextLength, voiceSettings.ttsSpeed]);

  const getBrowserSpeechCtor = useCallback((): BrowserSpeechRecognitionCtor | null => {
    if (typeof window === "undefined") return null;
    const ctor = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    return (ctor as BrowserSpeechRecognitionCtor) || null;
  }, []);

  const startBrowserRecognition = useCallback(async (autoSend = false) => {
    const SpeechCtor = getBrowserSpeechCtor();
    if (!SpeechCtor) {
      throw new Error("Browser speech recognition is not supported in this browser.");
    }
    if (recording || transcribing) return;
    if (isAssistantBusyNow()) {
      if (autoSend || voiceModeRef.current) {
        await interruptAssistantTurn();
      } else {
        return;
      }
    }
    if (isAssistantBusyNow()) return;

    setRecording(true);
    setTranscribing(true);
    let finalTranscript = "";

    const recognition = new SpeechCtor();
    speechRecognitionRef.current = recognition;
    recognition.lang = voiceSettings.sttLanguage || navigator.language || "en-US";
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event: any) => {
      const result = event?.results?.[0]?.[0]?.transcript;
      if (typeof result === "string") {
        finalTranscript = result.trim();
      }
    };

    recognition.onerror = (event: any) => {
      const code = String(event?.error || "");
      if (code === "no-speech" || code === "aborted") return;
      toast.error(`Voice transcription failed: ${code || "unknown error"}`);
      if (autoSend) clearAwaitingReply();
    };

    recognition.onend = () => {
      speechRecognitionRef.current = null;
      setRecording(false);
      setTranscribing(false);
      const transcript = finalTranscript.trim();
      if (!transcript) return;

      void (async () => {
        try {
          if (autoSend) {
            if (!voiceModeRef.current) return;
            markAwaitingReply();
            await sendTextDirect(transcript);
          } else {
            setContent((prev) => (prev ? `${prev} ${transcript}` : transcript));
          }
        } catch (err: any) {
          toast.error("Voice transcription failed: " + (err.message || "unknown error"));
          if (autoSend) clearAwaitingReply();
        }
      })();
    };

    recognition.start();
  }, [clearAwaitingReply, getBrowserSpeechCtor, interruptAssistantTurn, isAssistantBusyNow, markAwaitingReply, recording, sendTextDirect, transcribing, voiceSettings.sttLanguage]);

  const stopRecording = useCallback(() => {
    const speech = speechRecognitionRef.current;
    if (speech) {
      speech.stop();
      return;
    }
    if (mediaRecorderRef.current && recording) {
      mediaRecorderRef.current.stop();
      setRecording(false);
    }
  }, [recording]);

  const startRecording = useCallback(async (autoSend = false) => {
    if (recording || transcribing) return;
    if (isAssistantBusyNow()) {
      if (autoSend || voiceModeRef.current) {
        await interruptAssistantTurn();
      } else {
        return;
      }
    }
    if (isAssistantBusyNow()) return;
    if (voiceSettings.sttProvider === "browser") {
      try {
        await startBrowserRecognition(autoSend);
      } catch (err: any) {
        toast.error(err.message || "Browser speech recognition is unavailable.");
      }
      return;
    }
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
            markAwaitingReply();
            await sendTextDirect(transcript);
          } else {
            setContent((prev) => (prev ? `${prev} ${transcript}` : transcript));
          }
        } catch (err: any) {
          toast.error("Voice transcription failed: " + (err.message || "unknown error"));
          if (autoSend) clearAwaitingReply();
        } finally {
          setTranscribing(false);
        }
      };

      mediaRecorder.start();
      setRecording(true);

      // VAD: auto-stop after silence when in voice mode (autoSend)
      if (autoSend) {
        const audioCtx = new AudioContext();
        const source = audioCtx.createMediaStreamSource(stream);
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 512;
        source.connect(analyser);
        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        let silenceStart = 0;
        let speechDetected = false;
        const SILENCE_THRESHOLD = 12;
        const SILENCE_DURATION = 2500; // ms of silence before auto-stop
        const MIN_RECORD_TIME = 1000; // minimum recording time before checking silence

        const checkSilence = () => {
          if (mediaRecorder.state !== "recording") {
            audioCtx.close();
            return;
          }
          analyser.getByteFrequencyData(dataArray);
          const avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;

          if (avg > SILENCE_THRESHOLD) {
            speechDetected = true;
            silenceStart = 0;
          } else if (speechDetected) {
            if (!silenceStart) silenceStart = Date.now();
            else if (Date.now() - silenceStart > SILENCE_DURATION) {
              audioCtx.close();
              mediaRecorder.stop();
              setRecording(false);
              return;
            }
          }
          requestAnimationFrame(checkSilence);
        };
        // Delay VAD start to avoid cutting off immediately
        setTimeout(checkSilence, MIN_RECORD_TIME);
      }
    } catch {
      toast.error("Microphone access denied");
      if (autoSend) clearAwaitingReply();
    }
  }, [clearAwaitingReply, interruptAssistantTurn, isAssistantBusyNow, markAwaitingReply, recording, sendTextDirect, startBrowserRecognition, transcribing, voiceSettings.sttProvider]);

  const toggleVoiceMode = useCallback(async () => {
    if (voiceModeRef.current) {
      setVoiceMode(false);
      clearAwaitingReply();
      resetLiveSpeechState();
      stopRecording();
      if (activeAudioRef.current) {
        activeAudioRef.current.pause();
        activeAudioRef.current = null;
      }
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
      setTtsPlaying(false);
      toast.success("Voice mode off");
      return;
    }

    setVoiceMode(true);
    clearAwaitingReply();
    resetLiveSpeechState();
    toast.success("Voice mode on");

    if (voiceSettings.autoTranscribe && !isChatStreamingNow() && !recording && !transcribing) {
      await startRecording(true);
    }
  }, [clearAwaitingReply, isChatStreamingNow, recording, resetLiveSpeechState, startRecording, stopRecording, transcribing, voiceSettings.autoTranscribe]);

  useEffect(() => {
    playTtsRef.current = playTts;
  }, [playTts]);

  useEffect(() => {
    startRecordingRef.current = startRecording;
  }, [startRecording]);

  useEffect(() => {
    waitForChatIdleRef.current = waitForChatIdle;
  }, [waitForChatIdle]);

  // Barge-in monitor: if user starts speaking while assistant is generating, interrupt and listen.
  useEffect(() => {
    if (!voiceMode || !voiceSettings.bargeIn || !voiceSettings.autoTranscribe || recording || transcribing) {
      stopBargeInMonitor();
      return;
    }

    let cancelled = false;
    let speechAccumMs = 0;
    let lastTickAt = 0;
    let detectWindowStart = 0;
    let calibrationUntil = 0;
    let noiseRms = 0.008;
    const CALIBRATION_MS = 700;
    const MIN_SPEECH_MS = 500;
    const COOLDOWN_MS = 2200;
    const MIN_RMS_FLOOR = 0.018;
    const SPEECH_BAND_MIN = 9;

    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        bargeInMonitorStreamRef.current = stream;

        const audioCtx = new AudioContext();
        bargeInMonitorAudioCtxRef.current = audioCtx;
        const source = audioCtx.createMediaStreamSource(stream);
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 512;
        source.connect(analyser);
        const freqArray = new Uint8Array(analyser.frequencyBinCount);
        const timeArray = new Uint8Array(analyser.fftSize);

        const tick = () => {
          if (cancelled) return;
          const now = Date.now();
          const dt = lastTickAt ? Math.min(120, now - lastTickAt) : 16;
          lastTickAt = now;

          const canDetect =
            voiceModeRef.current &&
            voiceAwaitingReplyRef.current &&
            voiceSettingsRef.current.bargeIn &&
            (chatStreamingRef.current || ttsPlayingRef.current || streamSpeechLoopActiveRef.current || Boolean(activeAudioRef.current)) &&
            !recordingRef.current &&
            !transcribingRef.current;

          if (!canDetect) {
            speechAccumMs = 0;
            detectWindowStart = 0;
            calibrationUntil = 0;
            bargeInMonitorFrameRef.current = requestAnimationFrame(tick);
            return;
          }

          if (!detectWindowStart) {
            detectWindowStart = now;
            calibrationUntil = now + CALIBRATION_MS;
            speechAccumMs = 0;
          }

          analyser.getByteTimeDomainData(timeArray);
          let sqSum = 0;
          for (let i = 0; i < timeArray.length; i++) {
            const centered = (timeArray[i] - 128) / 128;
            sqSum += centered * centered;
          }
          const rms = Math.sqrt(sqSum / timeArray.length);

          analyser.getByteFrequencyData(freqArray);
          let speechBandSum = 0;
          let speechBandCount = 0;
          // Roughly 350Hz-3200Hz region where speech presence is stronger than breathing.
          for (let i = 4; i <= 38 && i < freqArray.length; i++) {
            speechBandSum += freqArray[i];
            speechBandCount++;
          }
          const speechBandAvg = speechBandCount ? speechBandSum / speechBandCount : 0;

          if (now < calibrationUntil) {
            noiseRms = noiseRms * 0.92 + rms * 0.08;
            speechAccumMs = 0;
            bargeInMonitorFrameRef.current = requestAnimationFrame(tick);
            return;
          }

          const duringPlayback = ttsPlayingRef.current || streamSpeechLoopActiveRef.current || Boolean(activeAudioRef.current);
          const dynamicRmsThreshold = Math.max(MIN_RMS_FLOOR, noiseRms * (duringPlayback ? 3.5 : 2.3));
          const speechBandThreshold = duringPlayback ? SPEECH_BAND_MIN + 8 : SPEECH_BAND_MIN;
          const isSpeechLike = rms > dynamicRmsThreshold && speechBandAvg > speechBandThreshold;

          if (isSpeechLike) {
            speechAccumMs += dt;
            const requiredMs = duringPlayback ? Math.max(900, MIN_SPEECH_MS) : MIN_SPEECH_MS;
            if (speechAccumMs >= requiredMs && now - bargeInCooldownRef.current >= COOLDOWN_MS) {
              bargeInCooldownRef.current = now;
              speechAccumMs = 0;
              void (async () => {
                await interruptAssistantTurn();
                if (voiceModeRef.current) {
                  await startRecordingRef.current(true);
                }
              })();
            }
          } else {
            speechAccumMs = Math.max(0, speechAccumMs - dt * 2);
            noiseRms = noiseRms * 0.97 + rms * 0.03;
          }

          bargeInMonitorFrameRef.current = requestAnimationFrame(tick);
        };

        bargeInMonitorFrameRef.current = requestAnimationFrame(tick);
      } catch {
        // no-op: barge-in remains available via mic button/manual interrupt
      }
    })();

    return () => {
      cancelled = true;
      stopBargeInMonitor();
    };
  }, [interruptAssistantTurn, recording, stopBargeInMonitor, transcribing, voiceMode, voiceSettings.autoTranscribe, voiceSettings.bargeIn]);

  // Stream assistant speech sentence-by-sentence while tokens arrive.
  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent).detail as { sessionId?: string; delta?: string } | undefined;
      if (detail?.sessionId && detail.sessionId !== sessionIdRef.current) return;
      if (!voiceModeRef.current || !voiceAwaitingReplyRef.current) return;
      if (!voiceSettingsRef.current.autoRead || !voiceSettingsRef.current.streamTts) return;
      if (typeof detail?.delta !== "string" || detail.delta.length === 0) return;

      streamSpeechBufferRef.current += detail.delta;
      const { chunks, remainder } = splitSpeakableChunks(streamSpeechBufferRef.current);
      streamSpeechBufferRef.current = remainder;
      enqueueLiveSpeechChunks(chunks);
    };

    window.addEventListener("synapse:assistant_stream_delta", handler);
    return () => window.removeEventListener("synapse:assistant_stream_delta", handler);
  }, [enqueueLiveSpeechChunks, splitSpeakableChunks]);

  // If a response is aborted, return to listening mode immediately.
  useEffect(() => {
    const handler = async (event: Event) => {
      const detail = (event as CustomEvent).detail as { sessionId?: string; aborted?: boolean } | undefined;
      if (detail?.sessionId && detail.sessionId !== sessionIdRef.current) return;
      if (!detail?.aborted) return;
      if (!voiceModeRef.current || !voiceAwaitingReplyRef.current) return;

      clearAwaitingReply();
      resetLiveSpeechState();
      if (voiceSettingsRef.current.autoTranscribe) {
        await waitForChatIdleRef.current(1500);
        await startRecordingRef.current(true);
      }
    };

    window.addEventListener("synapse:assistant_stream_done", handler);
    return () => window.removeEventListener("synapse:assistant_stream_done", handler);
  }, [clearAwaitingReply, resetLiveSpeechState]);

  // Voice mode turn-taking: when a new assistant message arrives, speak it then listen again.
  useEffect(() => {
    const handler = async (event: Event) => {
      const detail = (event as CustomEvent).detail as { content?: string; sessionId?: string; createdAt?: number } | undefined;
      if (typeof detail?.content !== "string" || !detail.content.trim()) return;
      if (detail.sessionId && detail.sessionId !== sessionIdRef.current) return;
      if (!voiceModeRef.current || !voiceAwaitingReplyRef.current) return;
      if (typeof detail.createdAt === "number" && awaitingSinceRef.current > 0 && detail.createdAt < (awaitingSinceRef.current - 500)) {
        return;
      }

      try {
        if (voiceSettingsRef.current.autoRead) {
          if (streamSpeechUsedRef.current) {
            const tail = streamSpeechBufferRef.current.trim();
            if (tail) {
              streamSpeechQueueRef.current.push(tail);
              streamSpeechBufferRef.current = "";
            }
            void runLiveSpeechQueue();
            await waitForLiveSpeechDrain();
          } else {
            await playTtsRef.current(detail.content);
          }
        }
      } catch (err: any) {
        toast.error("Voice playback failed: " + (err.message || "unknown error"));
      } finally {
        clearAwaitingReply();
        resetLiveSpeechState();
      }

      if (voiceModeRef.current && voiceSettingsRef.current.autoTranscribe) {
        await waitForChatIdleRef.current();
        await startRecordingRef.current(true);
      }
    };

    window.addEventListener("synapse:assistant_message", handler);
    return () => window.removeEventListener("synapse:assistant_message", handler);
  }, [clearAwaitingReply, resetLiveSpeechState, runLiveSpeechQueue, waitForLiveSpeechDrain]);

  useEffect(() => {
    return () => {
      if (speechRecognitionRef.current) {
        speechRecognitionRef.current.abort();
        speechRecognitionRef.current = null;
      }
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
        mediaRecorderRef.current.stop();
      }
      if (activeAudioRef.current) {
        activeAudioRef.current.pause();
        activeAudioRef.current = null;
      }
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
      if (typeof window !== "undefined" && awaitingReplyTimerRef.current != null) {
        window.clearTimeout(awaitingReplyTimerRef.current);
        awaitingReplyTimerRef.current = null;
      }
      stopBargeInMonitor();
      resetLiveSpeechState();
    };
  }, [resetLiveSpeechState, stopBargeInMonitor]);

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

  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of Array.from(items)) {
      if (item.type.startsWith("image/")) {
        e.preventDefault();
        const file = item.getAsFile();
        if (!file) continue;
        // Generate a readable name from the mime type
        const ext = file.type.split("/")[1] || "png";
        const namedFile = new File([file], `pasted-image.${ext}`, { type: file.type });
        const preview = URL.createObjectURL(namedFile);
        setAttachedFile({ file: namedFile, preview });
        toast.success("Image pasted!");
        return;
      }
    }
  };

  const voiceStatus = !voiceMode
    ? "off"
    : recording
      ? "listening"
      : transcribing
        ? "transcribing"
        : ttsPlaying
          ? "speaking"
          : voiceAwaitingReply || chatStreaming
            ? "thinking"
            : "ready";

  const voiceStatusMeta = voiceStatus === "listening"
    ? {
        label: "Listening",
        hint: "Speak naturally. I will send when you pause.",
        glowClass: "bg-emerald-500/30",
        ringClass: "border-emerald-300/60 animate-pulse",
        coreClass: "from-emerald-300 via-cyan-300 to-teal-500 animate-pulse",
      }
    : voiceStatus === "transcribing"
      ? {
          label: "Transcribing",
          hint: "Converting your speech to text.",
          glowClass: "bg-amber-500/30",
          ringClass: "border-amber-300/60",
          coreClass: "from-amber-300 via-orange-300 to-amber-500 animate-pulse",
        }
      : voiceStatus === "speaking"
        ? {
            label: "Responding",
            hint: "Playing assistant voice reply.",
            glowClass: "bg-fuchsia-500/30",
            ringClass: "border-fuchsia-300/60 animate-pulse",
            coreClass: "from-fuchsia-300 via-violet-300 to-indigo-500 animate-pulse",
          }
        : voiceStatus === "thinking"
          ? {
              label: "Thinking",
              hint: "Generating response. Start speaking to interrupt.",
              glowClass: "bg-blue-500/30",
              ringClass: "border-blue-300/60 animate-pulse",
              coreClass: "from-blue-300 via-indigo-300 to-cyan-500 animate-pulse",
            }
          : {
              label: "Voice Mode Ready",
              hint: "I will keep the conversation going turn-by-turn.",
              glowClass: "bg-cyan-500/20",
              ringClass: "border-cyan-200/30",
              coreClass: "from-cyan-300 via-sky-300 to-blue-500 animate-pulse-glow",
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

        {voiceMode && (
          <div className="mb-3 rounded-2xl border border-white/[0.08] bg-white/[0.03] backdrop-blur-2xl px-4 py-3">
            <div className="flex items-center gap-4">
              <div className="relative h-16 w-16 shrink-0">
                <span className={`absolute inset-0 rounded-full blur-2xl transition-all ${voiceStatusMeta.glowClass}`} />
                <span className={`absolute inset-1 rounded-full border ${voiceStatusMeta.ringClass}`} />
                <span className={`absolute inset-3 rounded-full bg-gradient-to-br ${voiceStatusMeta.coreClass}`} />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-zinc-200">{voiceStatusMeta.label}</p>
                <p className="text-xs text-zinc-500">{voiceStatusMeta.hint}</p>
              </div>
            </div>
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

        {/* Upload in progress indicator */}
        {uploading && !attachedFile && (
          <div className="mb-3 flex items-center gap-3 rounded-xl border border-blue-500/20 bg-blue-500/[0.06] backdrop-blur-2xl px-4 py-3">
            <Loader2 className="h-5 w-5 text-blue-400 animate-spin" />
            <span className="text-sm text-blue-300">Uploading file...</span>
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
            onMouseDown={() => { void startRecording(voiceMode || chatStreaming); }}
            onMouseUp={stopRecording}
            onMouseLeave={() => recording && stopRecording()}
            onTouchStart={() => { void startRecording(voiceMode || chatStreaming); }}
            onTouchEnd={stopRecording}
            disabled={transcribing || uploading}
            aria-label={recording ? "Stop recording" : "Hold to record voice"}
            title={chatStreaming ? "Hold to interrupt and speak" : "Hold to record voice"}
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
            onPaste={handlePaste}
            placeholder="Type a message..."
            className="min-h-[44px] max-h-32 resize-none bg-card text-base sm:text-sm"
            rows={1}
          />
          {chatStreaming ? (
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
              disabled={isDisabled || uploading || (!content.trim() && !attachedFile)}
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
