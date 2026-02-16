"use client";

import { useState, useCallback, useRef, ReactNode } from "react";
import { Upload, FileIcon, ImageIcon, FileText } from "lucide-react";
import { toast } from "sonner";
import { gatewayFetch } from "@/lib/gatewayFetch";

interface DropZoneProps {
  sessionId: string;
  children: ReactNode;
}

export function DropZone({ sessionId, children }: DropZoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ filename: string; progress: number } | null>(null);
  const dragCountRef = useRef(0);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCountRef.current++;
    if (e.dataTransfer.types.includes("Files")) {
      setIsDragging(true);
    }
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCountRef.current--;
    if (dragCountRef.current === 0) {
      setIsDragging(false);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCountRef.current = 0;
    setIsDragging(false);

    const files = Array.from(e.dataTransfer.files);
    if (files.length === 0) return;

    const cs = (window as any).__synapse_chat;
    const gatewayId = cs?.gatewayId;
    if (!gatewayId) {
      toast.error("Chat not initialized");
      return;
    }

    for (const file of files) {
      if (file.size > 25 * 1024 * 1024) {
        toast.error(`${file.name} is too large (max 25MB)`);
        continue;
      }

      setUploadProgress({ filename: file.name, progress: 30 });

      try {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("gatewayId", gatewayId);
        if (sessionId) formData.append("sessionId", sessionId);

        setUploadProgress({ filename: file.name, progress: 60 });

        const res = await gatewayFetch("/api/files/upload", { method: "POST", body: formData });
        if (!res.ok) throw new Error("Upload failed");
        const uploaded = await res.json();

        setUploadProgress({ filename: file.name, progress: 100 });

        // Insert file reference into chat input
        const fileRef = `[file:${uploaded.id}:${uploaded.filename}]`;

        // Handle different file types
        if (file.type.startsWith("image/")) {
          // For images, just send the reference
          window.dispatchEvent(new CustomEvent("synapse:insert-file", {
            detail: { ref: fileRef, filename: file.name, type: "image" }
          }));
        } else if (file.type.startsWith("text/") || /\.(md|json|csv|py|js|ts|tsx|jsx)$/i.test(file.name)) {
          // For text files, include content preview
          window.dispatchEvent(new CustomEvent("synapse:insert-file", {
            detail: { ref: fileRef, filename: file.name, type: "text" }
          }));
        } else {
          window.dispatchEvent(new CustomEvent("synapse:insert-file", {
            detail: { ref: fileRef, filename: file.name, type: "file" }
          }));
        }

        toast.success(`Uploaded ${file.name}`);
      } catch (err: any) {
        toast.error(`Failed to upload ${file.name}`);
      }
    }

    setUploadProgress(null);
  }, [sessionId]);

  return (
    <div
      className="relative flex-1 flex flex-col overflow-hidden"
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {children}

      {/* Drag overlay */}
      {isDragging && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm border-2 border-dashed border-blue-500/50 rounded-2xl m-2 transition-all">
          <div className="flex flex-col items-center gap-3 text-center">
            <div className="p-4 rounded-2xl bg-blue-500/10 border border-blue-500/20">
              <Upload className="h-8 w-8 text-blue-400" />
            </div>
            <div>
              <p className="text-sm font-medium text-zinc-200">Drop files here</p>
              <p className="text-xs text-zinc-400 mt-1">Images, text files, PDFs, and more</p>
            </div>
          </div>
        </div>
      )}

      {/* Upload progress */}
      {uploadProgress && (
        <div className="absolute bottom-20 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-4 py-2.5 rounded-xl bg-white/[0.07] backdrop-blur-xl border border-white/[0.12] shadow-lg">
          <div className="h-4 w-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
          <span className="text-xs text-zinc-300">Uploading {uploadProgress.filename}...</span>
          <div className="w-20 h-1.5 rounded-full bg-white/10 overflow-hidden">
            <div
              className="h-full bg-blue-500 rounded-full transition-all duration-300"
              style={{ width: `${uploadProgress.progress}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
