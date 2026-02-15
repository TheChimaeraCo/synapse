"use client";
import { gatewayFetch } from "@/lib/gatewayFetch";

import { useState, useRef, useEffect, useCallback } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Send, Square, X, Paperclip, FileIcon, Loader2, Mic, MicOff } from "lucide-react";
import { toast } from "sonner";
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
  const [transcribing, setTranscribing] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  const chatState = typeof window !== "undefined" ? (window as any).__synapse_chat : null;
  const isStreaming = chatState?.isStreaming || false;
  const isDisabled = sending || isStreaming;

  useEffect(() => {
    textareaRef.current?.focus();
  }, [sessionId]);

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

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        if (audioBlob.size < 100) return;

        setTranscribing(true);
        try {
          const formData = new FormData();
          formData.append("audio", audioBlob, "recording.webm");
          const res = await gatewayFetch("/api/voice/stt", { method: "POST", body: formData });
          if (!res.ok) throw new Error("Transcription failed");
          const { text } = await res.json();
          if (text) setContent((prev) => (prev ? prev + " " + text : text));
        } catch (err: any) {
          toast.error("Voice transcription failed: " + err.message);
        } finally {
          setTranscribing(false);
        }
      };

      mediaRecorder.start();
      setRecording(true);
    } catch (err: any) {
      toast.error("Microphone access denied");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && recording) {
      mediaRecorderRef.current.stop();
      setRecording(false);
    }
  };

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
    <div className="border-t border-white/[0.06] p-3 sm:p-5 pb-[calc(0.5rem+env(safe-area-inset-bottom))] sm:pb-[calc(0.75rem+env(safe-area-inset-bottom))] bg-white/[0.02] backdrop-blur-2xl">
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
            <button onClick={removeAttachment} className="p-1 rounded hover:bg-white/10 text-zinc-500 hover:text-zinc-300 transition shrink-0">
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

        <div className="flex gap-2">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="shrink-0 self-end text-zinc-400 hover:text-zinc-200"
            onClick={() => fileInputRef.current?.click()}
            disabled={isDisabled || uploading}
          >
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={`shrink-0 self-end ${recording ? "text-red-400 animate-pulse" : "text-zinc-400 hover:text-zinc-200"}`}
            onMouseDown={startRecording}
            onMouseUp={stopRecording}
            onMouseLeave={() => recording && stopRecording()}
            onTouchStart={startRecording}
            onTouchEnd={stopRecording}
            disabled={isDisabled || transcribing}
            title="Hold to record voice"
          >
            {transcribing ? <Loader2 className="h-4 w-4 animate-spin" /> : recording ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
          </Button>
          <Textarea
            ref={textareaRef}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message... (/ for commands, Shift+Enter for new line)"
            className="min-h-[44px] max-h-32 resize-none bg-card"
            rows={1}
          />
          {isStreaming ? (
            <Button
              onClick={handleStop}
              size="icon"
              variant="destructive"
              className="shrink-0 self-end"
            >
              <Square className="h-4 w-4" />
            </Button>
          ) : (
            <Button
              onClick={handleSend}
              disabled={isDisabled || !content.trim()}
              size="icon"
              className="shrink-0 self-end"
            >
              <Send className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
