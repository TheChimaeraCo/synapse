"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { toast } from "sonner";
import {
  ArrowRightLeft,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  CircleDot,
  Clock3,
  Command,
  FileText,
  Folder,
  FolderOpen,
  FolderPlus,
  Hash,
  Link2,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Search,
  Sparkles,
  Tags,
  Trash2,
  X,
} from "lucide-react";
import * as Y from "yjs";

import { AppShell } from "@/components/layout/AppShell";
import { gatewayFetch } from "@/lib/gatewayFetch";

interface VaultNote {
  path: string;
  vaultRelativePath: string;
  title: string;
  tags: string[];
  outgoing: string[];
  wordCount: number;
  updatedAt: number;
  size: number;
}

interface VaultIndexResponse {
  vaultPath: string;
  notes: VaultNote[];
  backlinksByPath: Record<string, string[]>;
  stats: {
    notes: number;
    tags: number;
    links: number;
  };
}

type ViewMode = "edit" | "preview" | "split";

interface YjsParticipant {
  clientId: string;
  name: string;
  activeFile?: string;
  cursor?: {
    line: number;
    ch: number;
    anchorLine?: number;
    anchorCh?: number;
    headLine?: number;
    headCh?: number;
  };
  isTyping: boolean;
  lastSeenAt: number;
}

interface YjsSyncResponse {
  ok: boolean;
  serverUpdate?: string;
  stateVector?: string;
  participants?: YjsParticipant[];
  liveMode?: boolean;
}

interface VaultTreeNode {
  id: string;
  type: "folder" | "note";
  name: string;
  children: VaultTreeNode[];
  path?: string;
  note?: VaultNote;
}

interface PaletteCommand {
  id: string;
  label: string;
  description: string;
  shortcut?: string;
  disabled?: boolean;
  run: () => void;
}

function buildVaultTree(notes: VaultNote[]): VaultTreeNode[] {
  const root: VaultTreeNode = {
    id: "folder:",
    type: "folder",
    name: "",
    children: [],
  };

  for (const note of notes) {
    const parts = note.vaultRelativePath.split("/").filter(Boolean);
    if (parts.length === 0) continue;

    let cursor = root;
    let folderPath = "";

    for (let i = 0; i < parts.length; i += 1) {
      const part = parts[i];
      const isLeaf = i === parts.length - 1;

      if (isLeaf) {
        cursor.children.push({
          id: `note:${note.path}`,
          type: "note",
          name: note.title || part.replace(/\.(md|markdown)$/i, ""),
          children: [],
          path: note.path,
          note,
        });
        continue;
      }

      folderPath = folderPath ? `${folderPath}/${part}` : part;
      const folderId = `folder:${folderPath}`;
      let folder = cursor.children.find((child) => child.id === folderId);
      if (!folder) {
        folder = {
          id: folderId,
          type: "folder",
          name: part,
          children: [],
        };
        cursor.children.push(folder);
      }
      cursor = folder;
    }
  }

  const sortNodes = (nodes: VaultTreeNode[]): VaultTreeNode[] => {
    const sorted = [...nodes].sort((a, b) => {
      if (a.type !== b.type) return a.type === "folder" ? -1 : 1;
      return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
    });
    return sorted.map((node) => {
      if (node.type === "folder") return { ...node, children: sortNodes(node.children) };
      return node;
    });
  };

  return sortNodes(root.children);
}

function folderIdsForNote(relativePath: string): string[] {
  const parts = relativePath.split("/").filter(Boolean);
  if (parts.length <= 1) return [];
  const out: string[] = [];
  let current = "";
  for (let i = 0; i < parts.length - 1; i += 1) {
    current = current ? `${current}/${parts[i]}` : parts[i];
    out.push(`folder:${current}`);
  }
  return out;
}

function toBase64(bytes: Uint8Array): string {
  if (!bytes || bytes.length === 0) return "";
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  if (!value) return new Uint8Array();
  const bin = atob(value);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}

function applyTextPatch(yText: Y.Text, nextValue: string) {
  const prev = yText.toString();
  if (prev === nextValue) return;
  let start = 0;
  while (start < prev.length && start < nextValue.length && prev[start] === nextValue[start]) {
    start += 1;
  }
  let prevEnd = prev.length - 1;
  let nextEnd = nextValue.length - 1;
  while (prevEnd >= start && nextEnd >= start && prev[prevEnd] === nextValue[nextEnd]) {
    prevEnd -= 1;
    nextEnd -= 1;
  }
  const removeLen = Math.max(0, prevEnd - start + 1);
  const insertText = nextValue.slice(start, nextEnd + 1);
  yText.doc?.transact(() => {
    if (removeLen > 0) yText.delete(start, removeLen);
    if (insertText) yText.insert(start, insertText);
  }, "local-input");
}

function cursorFromTextSelection(text: string, selStart: number, selEnd: number) {
  const safeStart = Math.max(0, Math.min(text.length, selStart));
  const safeEnd = Math.max(0, Math.min(text.length, selEnd));
  const toLineCh = (offset: number) => {
    const chunk = text.slice(0, offset);
    const lines = chunk.split("\n");
    return {
      line: Math.max(0, lines.length - 1),
      ch: lines[lines.length - 1]?.length ?? 0,
    };
  };
  const anchor = toLineCh(safeStart);
  const head = toLineCh(safeEnd);
  return {
    line: head.line,
    ch: head.ch,
    anchorLine: anchor.line,
    anchorCh: anchor.ch,
    headLine: head.line,
    headCh: head.ch,
  };
}

export default function VaultPage() {
  const router = useRouter();
  const [index, setIndex] = useState<VaultIndexResponse | null>(null);
  const [loadingIndex, setLoadingIndex] = useState(true);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [content, setContent] = useState("");
  const [originalContent, setOriginalContent] = useState("");
  const [loadingNote, setLoadingNote] = useState(false);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("split");
  const [participants, setParticipants] = useState<YjsParticipant[]>([]);
  const [yjsLiveMode, setYjsLiveMode] = useState(false);
  const [leftSidebarOpen, setLeftSidebarOpen] = useState(true);
  const [rightSidebarOpen, setRightSidebarOpen] = useState(true);
  const [leftPaneWidth, setLeftPaneWidth] = useState(320);
  const [rightPaneWidth, setRightPaneWidth] = useState(320);
  const [resizingPane, setResizingPane] = useState<"left" | "right" | null>(null);
  const [openTabs, setOpenTabs] = useState<string[]>([]);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [quickSwitcherOpen, setQuickSwitcherOpen] = useState(false);
  const [quickSearch, setQuickSearch] = useState("");

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const quickInputRef = useRef<HTMLInputElement | null>(null);
  const yDocRef = useRef<Y.Doc | null>(null);
  const yTextRef = useRef<Y.Text | null>(null);
  const ySyncTimerRef = useRef<number | null>(null);
  const yApplyingRemoteRef = useRef(false);
  const yPendingUpdatesRef = useRef<Uint8Array[]>([]);
  const yClientIdRef = useRef(
    `synapse-web-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`
  );
  const yLastTypingAtRef = useRef(0);
  const yCurrentDocPathRef = useRef<string>("");
  const ySelectionRef = useRef<{ start: number; end: number }>({ start: 0, end: 0 });

  const refreshIndex = useCallback(async () => {
    setLoadingIndex(true);
    try {
      const res = await gatewayFetch("/api/vault/index");
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to load vault index");
      setIndex(data as VaultIndexResponse);
      if (!selectedPath && data.notes?.[0]?.path) {
        setSelectedPath(data.notes[0].path);
      }
    } catch (err: any) {
      toast.error(err?.message || "Failed to load vault");
    } finally {
      setLoadingIndex(false);
    }
  }, [selectedPath]);

  const openNote = useCallback(async (path: string) => {
    setSelectedPath(path);
    setLoadingNote(true);
    try {
      const res = await gatewayFetch("/api/files/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "read", path }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Failed to open note");
      setContent(data.content || "");
      setOriginalContent(data.content || "");
    } catch (err: any) {
      toast.error(err?.message || "Failed to open note");
    } finally {
      setLoadingNote(false);
    }
  }, []);

  const saveNote = useCallback(async () => {
    if (!selectedPath) return;
    setSaving(true);
    try {
      const res = await gatewayFetch("/api/files/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "write", path: selectedPath, content }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Failed to save note");
      setOriginalContent(content);
      await refreshIndex();
      toast.success("Note saved");
    } catch (err: any) {
      toast.error(err?.message || "Failed to save note");
    } finally {
      setSaving(false);
    }
  }, [content, refreshIndex, selectedPath]);

  const createNote = useCallback(async () => {
    if (!index) return;
    const raw = window.prompt("New note path (inside vault):", "new-note.md");
    if (!raw) return;
    const clean = raw.replace(/\\/g, "/").replace(/^\/+/, "");
    const withExt = /\.(md|markdown)$/i.test(clean) ? clean : `${clean}.md`;
    const fullPath = `${index.vaultPath}/${withExt}`.replace(/\/+/g, "/");
    const title = withExt.split("/").pop()?.replace(/\.(md|markdown)$/i, "") || "New Note";
    const starter = `# ${title}\n\n`;
    try {
      const res = await gatewayFetch("/api/files/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "write", path: fullPath, content: starter }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Failed to create note");
      await refreshIndex();
      await openNote(fullPath);
      toast.success("Note created");
    } catch (err: any) {
      toast.error(err?.message || "Failed to create note");
    }
  }, [index, openNote, refreshIndex]);

  const createFolder = useCallback(async () => {
    if (!index) return;
    const raw = window.prompt("New folder path (inside vault):", "new-folder");
    if (!raw) return;
    const clean = raw.replace(/\\/g, "/").replace(/^\/+/, "").replace(/\/+$/, "");
    if (!clean) return;
    const fullPath = `${index.vaultPath}/${clean}`.replace(/\/+/g, "/");
    try {
      const res = await gatewayFetch("/api/files/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "mkdir", path: fullPath }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Failed to create folder");
      setExpandedFolders((prev) => {
        const next = new Set(prev);
        const parts = clean.split("/").filter(Boolean);
        let current = "";
        for (const part of parts) {
          current = current ? `${current}/${part}` : part;
          next.add(`folder:${current}`);
        }
        return next;
      });
      await refreshIndex();
      toast.success("Folder created");
    } catch (err: any) {
      toast.error(err?.message || "Failed to create folder");
    }
  }, [index, refreshIndex]);

  const renameCurrentNote = useCallback(async () => {
    if (!index || !selectedPath) return;
    const current = index.notes.find((note) => note.path === selectedPath);
    if (!current) return;
    const currentRel = current.vaultRelativePath;
    const extMatch = currentRel.match(/\.(md|markdown)$/i);
    const ext = extMatch?.[0] || ".md";
    const slash = currentRel.lastIndexOf("/");
    const dir = slash >= 0 ? `${currentRel.slice(0, slash + 1)}` : "";
    const base = currentRel.slice(slash + 1).replace(/\.(md|markdown)$/i, "");
    const raw = window.prompt("Rename note", base);
    if (!raw) return;
    const nextBase = raw.trim().replace(/[\\/]/g, "");
    if (!nextBase) return;
    const nextRel = `${dir}${nextBase}${ext}`;
    const destination = `${index.vaultPath}/${nextRel}`.replace(/\/+/g, "/");
    try {
      const res = await gatewayFetch("/api/files/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "move", path: selectedPath, destination }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Failed to rename note");
      setOpenTabs((prev) => prev.map((path) => (path === selectedPath ? destination : path)));
      setSelectedPath(destination);
      await refreshIndex();
      toast.success("Note renamed");
    } catch (err: any) {
      toast.error(err?.message || "Failed to rename note");
    }
  }, [index, refreshIndex, selectedPath]);

  const moveCurrentNote = useCallback(async () => {
    if (!index || !selectedPath) return;
    const current = index.notes.find((note) => note.path === selectedPath);
    if (!current) return;
    const raw = window.prompt("Move note to path (inside vault)", current.vaultRelativePath);
    if (!raw) return;
    const clean = raw.replace(/\\/g, "/").replace(/^\/+/, "");
    if (!clean) return;
    const withExt = /\.(md|markdown)$/i.test(clean) ? clean : `${clean}.md`;
    const destination = `${index.vaultPath}/${withExt}`.replace(/\/+/g, "/");
    try {
      const res = await gatewayFetch("/api/files/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "move", path: selectedPath, destination }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Failed to move note");
      setOpenTabs((prev) => prev.map((path) => (path === selectedPath ? destination : path)));
      setSelectedPath(destination);
      await refreshIndex();
      toast.success("Note moved");
    } catch (err: any) {
      toast.error(err?.message || "Failed to move note");
    }
  }, [index, refreshIndex, selectedPath]);

  const deleteCurrentNote = useCallback(async () => {
    if (!selectedPath) return;
    if (!window.confirm(`Delete note?\n\n${selectedPath}`)) return;
    try {
      const res = await gatewayFetch("/api/files/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", path: selectedPath }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Failed to delete note");
      const pathToDelete = selectedPath;
      setOpenTabs((prev) => {
        const idx = prev.indexOf(pathToDelete);
        const next = prev.filter((path) => path !== pathToDelete);
        if (selectedPath === pathToDelete) {
          const fallback = next[Math.max(0, idx - 1)] || next[idx] || null;
          setSelectedPath(fallback);
        }
        return next;
      });
      await refreshIndex();
      toast.success("Note deleted");
    } catch (err: any) {
      toast.error(err?.message || "Failed to delete note");
    }
  }, [refreshIndex, selectedPath]);

  const analyzeInChat = useCallback(() => {
    if (!selectedPath) return;
    const prompt = `Analyze this vault note and suggest improvements, structure, and next actions:\n\n${selectedPath}\n\nPlease use file_read on this path and then provide a concise analysis plus an optional rewrite draft.`;
    sessionStorage.setItem("synapse_chat_draft", prompt);
    router.push("/chat");
  }, [router, selectedPath]);

  const resolveDocPath = useCallback(() => {
    if (!selectedPath) return "";
    const vaultRoot = (index?.vaultPath || "").replace(/\/+$/, "");
    const cleanSelected = selectedPath.replace(/\\/g, "/");
    if (!vaultRoot) return cleanSelected;
    const prefixed = `${vaultRoot}/`;
    if (cleanSelected.startsWith(prefixed)) {
      return cleanSelected.slice(prefixed.length);
    }
    if (cleanSelected === vaultRoot) return "";
    return cleanSelected;
  }, [index?.vaultPath, selectedPath]);

  const stopYjsSyncLoop = useCallback(() => {
    if (ySyncTimerRef.current) {
      window.clearInterval(ySyncTimerRef.current);
      ySyncTimerRef.current = null;
    }
  }, []);

  const destroyYjsDoc = useCallback(() => {
    stopYjsSyncLoop();
    yPendingUpdatesRef.current = [];
    if (yDocRef.current) {
      try {
        yDocRef.current.destroy();
      } catch {}
    }
    yDocRef.current = null;
    yTextRef.current = null;
    yCurrentDocPathRef.current = "";
    setParticipants([]);
    setYjsLiveMode(false);
  }, [stopYjsSyncLoop]);

  const syncYjsOnce = useCallback(async (opts?: { includePresence?: boolean; offline?: boolean }) => {
    const yDoc = yDocRef.current;
    const yText = yTextRef.current;
    const docPath = yCurrentDocPathRef.current;
    if (!yDoc || !yText || !docPath || !index?.vaultPath) return;

    const pending = yPendingUpdatesRef.current;
    const merged = pending.length > 1
      ? Y.mergeUpdates(pending)
      : (pending[0] || new Uint8Array());
    yPendingUpdatesRef.current = [];

    const stateVector = Y.encodeStateVector(yDoc);
    const active = document.activeElement === textareaRef.current;
    const typingWindowMs = 2200;
    const isTyping = active && (Date.now() - yLastTypingAtRef.current) < typingWindowMs;
    const textValue = yText.toString();
    const selection = ySelectionRef.current;
    const cursor = cursorFromTextSelection(textValue, selection.start, selection.end);

    const res = await gatewayFetch("/sync/obsidian/yjs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        vaultPath: index.vaultPath,
        docPath,
        update: merged.length ? toBase64(merged) : undefined,
        stateVector: toBase64(stateVector),
        presence: opts?.includePresence === false
          ? undefined
          : {
              clientId: yClientIdRef.current,
              clientName: "Synapse Web",
              activeFile: docPath,
              cursor,
              isTyping,
              offline: Boolean(opts?.offline),
            },
      }),
    });
    const data = (await res.json().catch(() => ({}))) as YjsSyncResponse & { error?: string };
    if (!res.ok) {
      throw new Error(data?.error || "Yjs sync failed");
    }

    if (data.serverUpdate) {
      const serverUpdate = fromBase64(data.serverUpdate);
      if (serverUpdate.length > 0) {
        yApplyingRemoteRef.current = true;
        Y.applyUpdate(yDoc, serverUpdate, "server");
        yApplyingRemoteRef.current = false;
      }
    }
    setParticipants(Array.isArray(data.participants) ? data.participants : []);
    setYjsLiveMode(Boolean(data.liveMode));
  }, [index?.vaultPath]);

  const startYjsForCurrentNote = useCallback(async (baselineText: string) => {
    const docPath = resolveDocPath();
    if (!docPath || !index?.vaultPath) return;

    destroyYjsDoc();

    const doc = new Y.Doc();
    const yText = doc.getText("content");
    const baseline = baselineText || "";
    if (baseline) yText.insert(0, baseline);

    doc.on("update", (update: Uint8Array, origin: unknown) => {
      if (origin === "server") return;
      yPendingUpdatesRef.current.push(update);
    });

    yText.observe(() => {
      const nextValue = yText.toString();
      setContent(nextValue);
    });

    yDocRef.current = doc;
    yTextRef.current = yText;
    yCurrentDocPathRef.current = docPath;
    yPendingUpdatesRef.current = [];

    try {
      await syncYjsOnce();
    } catch (err: any) {
      toast.error(err?.message || "Failed to initialize Yjs sync");
      return;
    }

    ySyncTimerRef.current = window.setInterval(() => {
      void syncYjsOnce().catch(() => {});
    }, 900);
  }, [destroyYjsDoc, index?.vaultPath, resolveDocPath, syncYjsOnce]);

  useEffect(() => {
    void refreshIndex();
  }, [refreshIndex]);

  useEffect(() => {
    if (!selectedPath) return;
    void openNote(selectedPath);
  }, [openNote, selectedPath]);

  useEffect(() => {
    if (!selectedPath || loadingNote) return;
    const docPath = resolveDocPath();
    if (!docPath) return;
    if (yCurrentDocPathRef.current === docPath) return;
    const baseline = originalContent || content;
    void startYjsForCurrentNote(baseline);
    return () => {
      void syncYjsOnce({ offline: true }).catch(() => {});
      destroyYjsDoc();
    };
  }, [
    destroyYjsDoc,
    loadingNote,
    originalContent,
    resolveDocPath,
    selectedPath,
    startYjsForCurrentNote,
    syncYjsOnce,
  ]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isTypingTarget =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          (target as HTMLElement).isContentEditable);
      const key = e.key.toLowerCase();
      const withMod = e.ctrlKey || e.metaKey;

      if (withMod && key === "s") {
        e.preventDefault();
        void saveNote();
        return;
      }
      if (withMod && key === "n") {
        e.preventDefault();
        if (e.shiftKey) void createFolder();
        else void createNote();
        return;
      }
      if (withMod && (key === "p" || key === "o")) {
        e.preventDefault();
        setQuickSwitcherOpen(true);
        return;
      }
      if (withMod && key === "b") {
        e.preventDefault();
        setLeftSidebarOpen((prev) => !prev);
        return;
      }
      if (withMod && key === ".") {
        e.preventDefault();
        setRightSidebarOpen((prev) => !prev);
        return;
      }
      if (e.key === "Escape" && quickSwitcherOpen) {
        e.preventDefault();
        setQuickSwitcherOpen(false);
        return;
      }
      if (isTypingTarget) return;
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [createFolder, createNote, quickSwitcherOpen, saveNote]);

  useEffect(() => {
    if (!quickSwitcherOpen) return;
    const id = window.setTimeout(() => {
      quickInputRef.current?.focus();
      quickInputRef.current?.select();
    }, 10);
    return () => window.clearTimeout(id);
  }, [quickSwitcherOpen]);

  useEffect(() => {
    const leftStored = window.localStorage.getItem("vault_left_pane_width");
    const rightStored = window.localStorage.getItem("vault_right_pane_width");
    if (leftStored) {
      const parsed = Number.parseInt(leftStored, 10);
      if (Number.isFinite(parsed)) setLeftPaneWidth(Math.max(240, Math.min(520, parsed)));
    }
    if (rightStored) {
      const parsed = Number.parseInt(rightStored, 10);
      if (Number.isFinite(parsed)) setRightPaneWidth(Math.max(240, Math.min(520, parsed)));
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem("vault_left_pane_width", String(leftPaneWidth));
  }, [leftPaneWidth]);

  useEffect(() => {
    window.localStorage.setItem("vault_right_pane_width", String(rightPaneWidth));
  }, [rightPaneWidth]);

  useEffect(() => {
    if (!resizingPane) return;
    const onMouseMove = (event: MouseEvent) => {
      const vw = window.innerWidth || 1440;
      const min = 240;
      const max = Math.min(520, Math.max(320, Math.floor(vw * 0.45)));
      if (resizingPane === "left") {
        setLeftPaneWidth(Math.max(min, Math.min(max, event.clientX)));
      } else {
        const next = vw - event.clientX;
        setRightPaneWidth(Math.max(min, Math.min(max, next)));
      }
    };
    const onMouseUp = () => setResizingPane(null);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [resizingPane]);

  useEffect(() => () => {
    void syncYjsOnce({ offline: true }).catch(() => {});
    destroyYjsDoc();
  }, [destroyYjsDoc, syncYjsOnce]);

  const selectedMeta = useMemo(
    () => index?.notes.find((n) => n.path === selectedPath) || null,
    [index, selectedPath]
  );

  const filteredNotes = useMemo(() => {
    if (!index) return [];
    const q = search.trim().toLowerCase();
    if (!q) return index.notes;
    return index.notes.filter((n) =>
      n.title.toLowerCase().includes(q) ||
      n.vaultRelativePath.toLowerCase().includes(q) ||
      n.tags.some((t) => t.includes(q))
    );
  }, [index, search]);

  const noteTree = useMemo(() => buildVaultTree(filteredNotes), [filteredNotes]);

  useEffect(() => {
    if (!selectedMeta) return;
    const parents = folderIdsForNote(selectedMeta.vaultRelativePath);
    if (!parents.length) return;
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      let changed = false;
      for (const folderId of parents) {
        if (!next.has(folderId)) {
          next.add(folderId);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [selectedMeta]);

  useEffect(() => {
    if (!selectedPath) return;
    setOpenTabs((prev) => (prev.includes(selectedPath) ? prev : [...prev, selectedPath]));
  }, [selectedPath]);

  useEffect(() => {
    if (!index) return;
    const valid = new Set(index.notes.map((note) => note.path));
    setOpenTabs((prev) => prev.filter((path) => valid.has(path)));
    setSelectedPath((prev) => {
      if (prev && valid.has(prev)) return prev;
      return index.notes[0]?.path ?? null;
    });
  }, [index]);

  const backlinks = useMemo(
    () => (selectedPath && index?.backlinksByPath[selectedPath]) || [],
    [index, selectedPath]
  );

  const quickResults = useMemo(() => {
    if (!index) return [];
    const q = quickSearch.trim().toLowerCase();
    if (!q) return index.notes.slice(0, 30);
    return index.notes
      .filter((n) =>
        n.title.toLowerCase().includes(q) ||
        n.vaultRelativePath.toLowerCase().includes(q) ||
        n.tags.some((t) => t.includes(q))
      )
      .slice(0, 30);
  }, [index, quickSearch]);

  const openTabNotes = useMemo(
    () =>
      openTabs
        .map((path) => index?.notes.find((note) => note.path === path))
        .filter((note): note is VaultNote => Boolean(note)),
    [index, openTabs]
  );

  const editorStats = useMemo(() => {
    const words = content.trim() ? content.trim().split(/\s+/).length : 0;
    const chars = content.length;
    const lines = content ? content.split("\n").length : 1;
    return { words, chars, lines };
  }, [content]);

  const isDirty = content !== originalContent;

  const selectNote = useCallback((path: string) => {
    setSelectedPath(path);
    setOpenTabs((prev) => (prev.includes(path) ? prev : [...prev, path]));
    setQuickSwitcherOpen(false);
    setQuickSearch("");
  }, []);

  const closeTab = useCallback((path: string) => {
    setOpenTabs((prev) => {
      const idx = prev.indexOf(path);
      const next = prev.filter((p) => p !== path);
      if (selectedPath === path) {
        const fallback = next[Math.max(0, idx - 1)] || next[idx] || null;
        setSelectedPath(fallback);
      }
      return next;
    });
  }, [selectedPath]);

  const paletteCommands = useMemo<PaletteCommand[]>(() => [
    {
      id: "new-note",
      label: "New Note",
      description: "Create a new markdown note in the vault",
      shortcut: "Ctrl/Cmd+N",
      run: () => { void createNote(); },
    },
    {
      id: "new-folder",
      label: "New Folder",
      description: "Create a folder in the vault tree",
      run: () => { void createFolder(); },
    },
    {
      id: "save-note",
      label: "Save Note",
      description: "Save current note",
      shortcut: "Ctrl/Cmd+S",
      disabled: !selectedPath || !isDirty,
      run: () => { void saveNote(); },
    },
    {
      id: "rename-note",
      label: "Rename Current Note",
      description: "Rename the selected note",
      disabled: !selectedPath,
      run: () => { void renameCurrentNote(); },
    },
    {
      id: "move-note",
      label: "Move Current Note",
      description: "Move selected note to another folder",
      disabled: !selectedPath,
      run: () => { void moveCurrentNote(); },
    },
    {
      id: "delete-note",
      label: "Delete Current Note",
      description: "Delete selected note",
      disabled: !selectedPath,
      run: () => { void deleteCurrentNote(); },
    },
    {
      id: "toggle-left",
      label: leftSidebarOpen ? "Hide Left Explorer" : "Show Left Explorer",
      description: "Toggle file explorer pane",
      shortcut: "Ctrl/Cmd+B",
      run: () => setLeftSidebarOpen((prev) => !prev),
    },
    {
      id: "toggle-right",
      label: rightSidebarOpen ? "Hide Right Context" : "Show Right Context",
      description: "Toggle note context pane",
      shortcut: "Ctrl/Cmd+.",
      run: () => setRightSidebarOpen((prev) => !prev),
    },
    {
      id: "view-edit",
      label: "View: Edit",
      description: "Switch editor to edit mode",
      run: () => setViewMode("edit"),
    },
    {
      id: "view-preview",
      label: "View: Preview",
      description: "Switch editor to preview mode",
      run: () => setViewMode("preview"),
    },
    {
      id: "view-split",
      label: "View: Split",
      description: "Switch editor to split mode",
      run: () => setViewMode("split"),
    },
    {
      id: "analyze",
      label: "Analyze Current Note",
      description: "Send current note context to agent chat",
      disabled: !selectedPath,
      run: () => analyzeInChat(),
    },
  ], [
    analyzeInChat,
    createFolder,
    createNote,
    deleteCurrentNote,
    isDirty,
    leftSidebarOpen,
    moveCurrentNote,
    renameCurrentNote,
    rightSidebarOpen,
    saveNote,
    selectedPath,
  ]);

  const normalizedQuickSearch = quickSearch.replace(/^>\s*/, "").trim().toLowerCase();
  const commandMode = quickSearch.trim().startsWith(">");
  const filteredPaletteCommands = useMemo(() => {
    if (!normalizedQuickSearch) return paletteCommands;
    return paletteCommands.filter((command) =>
      command.label.toLowerCase().includes(normalizedQuickSearch) ||
      command.description.toLowerCase().includes(normalizedQuickSearch)
    );
  }, [normalizedQuickSearch, paletteCommands]);

  const renderTreeNodes = useCallback((nodes: VaultTreeNode[], depth = 0) => (
    nodes.map((node) => {
      if (node.type === "folder") {
        const expanded = expandedFolders.has(node.id);
        return (
          <div key={node.id}>
            <button
              onClick={() =>
                setExpandedFolders((prev) => {
                  const next = new Set(prev);
                  if (next.has(node.id)) next.delete(node.id);
                  else next.add(node.id);
                  return next;
                })
              }
              className="group flex w-full items-center gap-1.5 rounded-md py-1.5 pr-2 text-xs text-zinc-300 hover:bg-white/[0.06]"
              style={{ paddingLeft: `${10 + depth * 14}px` }}
            >
              <ChevronRight className={`h-3 w-3 text-zinc-500 transition-transform ${expanded ? "rotate-90" : ""}`} />
              {expanded ? <FolderOpen className="h-3.5 w-3.5 text-amber-300" /> : <Folder className="h-3.5 w-3.5 text-zinc-400" />}
              <span className="truncate">{node.name}</span>
            </button>
            {expanded ? renderTreeNodes(node.children, depth + 1) : null}
          </div>
        );
      }
      const note = node.note as VaultNote;
      const active = note.path === selectedPath;
      return (
        <button
          key={node.id}
          onClick={() => selectNote(note.path)}
          className={`group flex w-full items-center gap-1.5 rounded-md py-1.5 pr-2 text-left text-xs ${
            active
              ? "bg-cyan-500/18 text-cyan-100"
              : "text-zinc-300 hover:bg-white/[0.06]"
          }`}
          style={{ paddingLeft: `${26 + depth * 14}px` }}
        >
          <FileText className={`h-3.5 w-3.5 ${active ? "text-cyan-200" : "text-zinc-500 group-hover:text-zinc-300"}`} />
          <span className="truncate">{note.title}</span>
        </button>
      );
    })
  ), [expandedFolders, selectNote, selectedPath]);

  return (
    <AppShell title="Vault">
      <div className="h-full bg-[#1f2129] text-zinc-100">
        <div className="flex h-full min-h-0">
          {leftSidebarOpen ? (
            <aside
              className="shrink-0 min-w-[240px] max-w-[520px] border-r border-white/10 bg-[#171922] flex flex-col min-h-0"
              style={{ width: leftPaneWidth }}
            >
              <div className="border-b border-white/10 p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="text-[11px] uppercase tracking-[0.16em] text-zinc-400 flex items-center gap-1.5">
                    <BookOpen className="h-3.5 w-3.5" />
                    File Explorer
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => void createNote()}
                      className="p-1.5 rounded hover:bg-white/[0.08] text-zinc-400 hover:text-zinc-100"
                      title="New note"
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => void createFolder()}
                      className="p-1.5 rounded hover:bg-white/[0.08] text-zinc-400 hover:text-zinc-100"
                      title="New folder"
                    >
                      <FolderPlus className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => void refreshIndex()}
                      className="p-1.5 rounded hover:bg-white/[0.08] text-zinc-400 hover:text-zinc-100"
                      title="Refresh index"
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => setLeftSidebarOpen(false)}
                      className="p-1.5 rounded hover:bg-white/[0.08] text-zinc-400 hover:text-zinc-100"
                      title="Collapse explorer"
                    >
                      <ChevronLeft className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
                <div className="text-[11px] text-zinc-500 truncate">Vault: {index?.vaultPath || "obsidian-vault"}</div>
                <div className="flex items-center gap-2 rounded-md border border-white/10 bg-white/[0.04] px-2 py-1.5">
                  <Search className="h-3.5 w-3.5 text-zinc-500" />
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search files..."
                    className="w-full bg-transparent text-sm outline-none placeholder:text-zinc-500"
                  />
                </div>
                <button
                  onClick={() => setQuickSwitcherOpen(true)}
                  className="w-full rounded-md border border-white/10 bg-white/[0.03] px-2 py-1.5 text-left text-xs text-zinc-300 hover:bg-white/[0.08]"
                >
                  <span className="inline-flex items-center gap-1.5">
                    <Command className="h-3.5 w-3.5 text-zinc-500" />
                    Command Palette
                  </span>
                </button>
                <div className="flex items-center gap-3 text-[11px] text-zinc-500">
                  <span>{index?.stats.notes ?? 0} notes</span>
                  <span>{index?.stats.tags ?? 0} tags</span>
                  <span>{index?.stats.links ?? 0} links</span>
                </div>
              </div>
              <div className="flex-1 overflow-auto py-2">
                {loadingIndex ? (
                  <div className="px-3 text-xs text-zinc-500">Indexing vault...</div>
                ) : noteTree.length === 0 ? (
                  <div className="px-3 text-xs text-zinc-500">No notes found.</div>
                ) : (
                  renderTreeNodes(noteTree)
                )}
              </div>
            </aside>
          ) : (
            <button
              onClick={() => setLeftSidebarOpen(true)}
              className="hidden md:flex h-full w-8 items-start justify-center border-r border-white/10 bg-[#171922] pt-3 text-zinc-500 hover:text-zinc-200"
              title="Open explorer"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          )}

          {leftSidebarOpen ? (
            <div
              role="separator"
              aria-label="Resize explorer"
              className="hidden md:block w-1.5 cursor-col-resize bg-transparent hover:bg-cyan-400/30 transition-colors"
              onMouseDown={(event) => {
                event.preventDefault();
                setResizingPane("left");
              }}
            />
          ) : null}

          <section className="min-w-0 flex-1 flex flex-col">
            <div className="border-b border-white/10 bg-[#1b1d26] px-3 py-2 flex items-center gap-2">
              <button
                onClick={() => setLeftSidebarOpen((prev) => !prev)}
                className="rounded-md p-1.5 text-zinc-400 hover:bg-white/[0.08] hover:text-zinc-100"
                title="Toggle explorer (Ctrl/Cmd+B)"
              >
                {leftSidebarOpen ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              </button>
              <button
                onClick={() => setRightSidebarOpen((prev) => !prev)}
                className="rounded-md p-1.5 text-zinc-400 hover:bg-white/[0.08] hover:text-zinc-100"
                title="Toggle context (Ctrl/Cmd+.)"
              >
                {rightSidebarOpen ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
              </button>
              <button
                onClick={() => setQuickSwitcherOpen(true)}
                className="ml-1 rounded-md border border-white/10 bg-white/[0.03] px-2 py-1 text-xs text-zinc-300 hover:bg-white/[0.08]"
              >
                Command Palette
              </button>
              <div className="ml-auto inline-flex items-center gap-1 rounded-md border border-white/10 bg-white/[0.03] px-2 py-1 text-[11px] text-zinc-400">
                <CircleDot className="h-3.5 w-3.5" />
                {yjsLiveMode ? "Live Sync" : "Solo"}
                <span className="text-zinc-600">•</span>
                {participants.length || 1} online
              </div>
            </div>

            <div className="border-b border-white/10 bg-[#171922] flex items-end gap-1 overflow-x-auto px-2 pt-2">
              {openTabNotes.map((note) => {
                const active = note.path === selectedPath;
                return (
                  <button
                    key={note.path}
                    onClick={() => selectNote(note.path)}
                    className={`group flex items-center gap-2 rounded-t-md border border-b-0 px-3 py-1.5 text-xs ${
                      active
                        ? "border-cyan-400/40 bg-[#202531] text-cyan-100"
                        : "border-white/10 bg-white/[0.03] text-zinc-300 hover:bg-white/[0.08]"
                    }`}
                  >
                    <FileText className="h-3.5 w-3.5" />
                    <span className="max-w-[140px] truncate">{note.title}</span>
                    <span
                      onClick={(e) => {
                        e.stopPropagation();
                        closeTab(note.path);
                      }}
                      className="rounded p-0.5 text-zinc-500 hover:bg-black/30 hover:text-zinc-200"
                      aria-label={`Close ${note.title}`}
                    >
                      <X className="h-3 w-3" />
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="border-b border-white/10 bg-[#1b1d26] px-3 py-2 flex flex-wrap items-center gap-2">
              <div className="min-w-0 flex-1 text-sm truncate text-zinc-300">
                {selectedMeta?.vaultRelativePath || "Select a note"}
                {isDirty ? <span className="ml-1 text-amber-300">*</span> : null}
              </div>
              <div className="flex items-center gap-1 rounded-md border border-white/10 bg-white/[0.03] p-1">
                {(["edit", "preview", "split"] as ViewMode[]).map((mode) => (
                  <button
                    key={mode}
                    onClick={() => setViewMode(mode)}
                    className={`rounded px-2 py-1 text-xs ${
                      viewMode === mode ? "bg-cyan-500/20 text-cyan-100" : "text-zinc-400 hover:text-zinc-200"
                    }`}
                  >
                    {mode}
                  </button>
                ))}
              </div>
              <button
                onClick={() => void saveNote()}
                disabled={!selectedPath || saving || !isDirty}
                className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600/90 px-3 py-1.5 text-xs text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Save className="h-3.5 w-3.5" />
                {saving ? "Saving..." : "Save"}
              </button>
              <button
                onClick={analyzeInChat}
                disabled={!selectedPath}
                className="inline-flex items-center gap-1.5 rounded-md bg-violet-600/90 px-3 py-1.5 text-xs text-white hover:bg-violet-500 disabled:opacity-50"
              >
                <Sparkles className="h-3.5 w-3.5" />
                Analyze
              </button>
              <button
                onClick={() => void renameCurrentNote()}
                disabled={!selectedPath}
                className="inline-flex items-center gap-1.5 rounded-md border border-white/15 bg-white/[0.03] px-2.5 py-1.5 text-xs text-zinc-300 hover:bg-white/[0.08] disabled:opacity-50"
                title="Rename note"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => void moveCurrentNote()}
                disabled={!selectedPath}
                className="inline-flex items-center gap-1.5 rounded-md border border-white/15 bg-white/[0.03] px-2.5 py-1.5 text-xs text-zinc-300 hover:bg-white/[0.08] disabled:opacity-50"
                title="Move note"
              >
                <ArrowRightLeft className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => void deleteCurrentNote()}
                disabled={!selectedPath}
                className="inline-flex items-center gap-1.5 rounded-md border border-red-400/30 bg-red-500/10 px-2.5 py-1.5 text-xs text-red-200 hover:bg-red-500/20 disabled:opacity-50"
                title="Delete note"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>

            {!selectedPath ? (
              <div className="flex-1 grid place-items-center text-sm text-zinc-500">
                Choose a note from the explorer to begin.
              </div>
            ) : loadingNote ? (
              <div className="flex-1 grid place-items-center text-sm text-zinc-500">Loading note...</div>
            ) : (
              <div className={`flex-1 min-h-0 ${viewMode === "split" ? "grid grid-cols-1 xl:grid-cols-2" : "grid grid-cols-1"}`}>
                {(viewMode === "edit" || viewMode === "split") && (
                  <textarea
                    ref={textareaRef}
                    value={content}
                    onChange={(e) => {
                      const nextValue = e.target.value;
                      ySelectionRef.current = {
                        start: e.target.selectionStart || 0,
                        end: e.target.selectionEnd || 0,
                      };
                      yLastTypingAtRef.current = Date.now();
                      const yText = yTextRef.current;
                      if (yText) {
                        if (yApplyingRemoteRef.current) {
                          setContent(nextValue);
                          return;
                        }
                        applyTextPatch(yText, nextValue);
                      } else {
                        setContent(nextValue);
                      }
                    }}
                    onSelect={(e) => {
                      ySelectionRef.current = {
                        start: e.currentTarget.selectionStart || 0,
                        end: e.currentTarget.selectionEnd || 0,
                      };
                    }}
                    spellCheck={false}
                    className={`h-full w-full resize-none bg-[#20232d] p-5 text-sm leading-6 text-zinc-100 outline-none font-mono ${
                      viewMode === "split" ? "border-r border-white/10" : ""
                    }`}
                  />
                )}
                {(viewMode === "preview" || viewMode === "split") && (
                  <div className="h-full overflow-auto bg-[#1a1d27] p-6">
                    <article className="prose prose-invert prose-zinc max-w-none prose-headings:tracking-tight prose-a:text-cyan-300 hover:prose-a:text-cyan-200">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
                    </article>
                  </div>
                )}
              </div>
            )}

            <div className="h-8 border-t border-white/10 bg-[#171922] px-3 flex items-center justify-between text-[11px] text-zinc-500">
              <div className="inline-flex items-center gap-2">
                <Clock3 className="h-3.5 w-3.5" />
                {selectedMeta?.updatedAt ? `Updated ${new Date(selectedMeta.updatedAt).toLocaleString()}` : "No note selected"}
              </div>
              <div className="inline-flex items-center gap-3">
                <span>{editorStats.words} words</span>
                <span>{editorStats.lines} lines</span>
                <span>{editorStats.chars} chars</span>
              </div>
            </div>
          </section>

          {rightSidebarOpen ? (
            <div
              role="separator"
              aria-label="Resize context"
              className="hidden md:block w-1.5 cursor-col-resize bg-transparent hover:bg-cyan-400/30 transition-colors"
              onMouseDown={(event) => {
                event.preventDefault();
                setResizingPane("right");
              }}
            />
          ) : null}

          {rightSidebarOpen ? (
            <aside
              className="shrink-0 min-w-[240px] max-w-[520px] border-l border-white/10 bg-[#171922] flex flex-col min-h-0"
              style={{ width: rightPaneWidth }}
            >
              <div className="border-b border-white/10 px-3 py-2.5 flex items-center justify-between">
                <div className="text-[11px] uppercase tracking-[0.16em] text-zinc-400">Context</div>
                <button
                  onClick={() => setRightSidebarOpen(false)}
                  className="p-1 rounded hover:bg-white/[0.08] text-zinc-500 hover:text-zinc-200"
                  title="Collapse context"
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="flex-1 overflow-auto p-3 space-y-4">
                <section>
                  <div className="mb-1.5 text-xs text-zinc-500">Collaborators</div>
                  <div className="space-y-1.5">
                    {(participants.length
                      ? participants
                      : [
                          {
                            clientId: yClientIdRef.current,
                            name: "You",
                            isTyping: false,
                            lastSeenAt: Date.now(),
                          } as YjsParticipant,
                        ]
                    ).map((participant) => (
                      <div key={participant.clientId} className="rounded-lg border border-white/10 bg-white/[0.03] px-2 py-1.5 text-xs">
                        <div className="text-zinc-200">
                          {participant.name}
                          {participant.isTyping ? <span className="ml-2 text-emerald-300">typing</span> : null}
                        </div>
                        {participant.activeFile ? <div className="truncate text-zinc-500">{participant.activeFile}</div> : null}
                      </div>
                    ))}
                  </div>
                </section>

                <section>
                  <div className="mb-1.5 flex items-center gap-1.5 text-xs text-zinc-400">
                    <Tags className="h-3.5 w-3.5" />
                    Tags
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {selectedMeta?.tags?.length ? (
                      selectedMeta.tags.map((tag) => (
                        <button
                          key={tag}
                          onClick={() => setSearch(tag)}
                          className="rounded-full border border-cyan-400/30 bg-cyan-500/15 px-2 py-0.5 text-[11px] text-cyan-200"
                        >
                          #{tag}
                        </button>
                      ))
                    ) : (
                      <div className="text-xs text-zinc-500">No tags</div>
                    )}
                  </div>
                </section>

                <section>
                  <div className="mb-1.5 flex items-center gap-1.5 text-xs text-zinc-400">
                    <Link2 className="h-3.5 w-3.5" />
                    Outgoing Links
                  </div>
                  <div className="space-y-1.5">
                    {selectedMeta?.outgoing?.length ? (
                      selectedMeta.outgoing.map((path) => (
                        <button
                          key={path}
                          onClick={() => selectNote(path)}
                          className="block w-full truncate rounded-md border border-white/10 bg-white/[0.03] px-2 py-1.5 text-left text-xs hover:bg-white/[0.08]"
                        >
                          {path}
                        </button>
                      ))
                    ) : (
                      <div className="text-xs text-zinc-500">No outgoing links</div>
                    )}
                  </div>
                </section>

                <section>
                  <div className="mb-1.5 flex items-center gap-1.5 text-xs text-zinc-400">
                    <Link2 className="h-3.5 w-3.5" />
                    Backlinks
                  </div>
                  <div className="space-y-1.5">
                    {backlinks.length ? (
                      backlinks.map((path) => (
                        <button
                          key={path}
                          onClick={() => selectNote(path)}
                          className="block w-full truncate rounded-md border border-white/10 bg-white/[0.03] px-2 py-1.5 text-left text-xs hover:bg-white/[0.08]"
                        >
                          {path}
                        </button>
                      ))
                    ) : (
                      <div className="text-xs text-zinc-500">No backlinks</div>
                    )}
                  </div>
                </section>

                <section>
                  <div className="mb-1.5 flex items-center gap-1.5 text-xs text-zinc-400">
                    <Hash className="h-3.5 w-3.5" />
                    Metadata
                  </div>
                  <div className="rounded-lg border border-white/10 bg-white/[0.03] p-2 text-xs text-zinc-400 space-y-1">
                    <div>Word count: {selectedMeta?.wordCount ?? 0}</div>
                    <div>Size: {selectedMeta?.size ?? 0} bytes</div>
                    <div className="truncate">Path: {selectedPath || `${index?.vaultPath || "obsidian-vault"}/...`}</div>
                  </div>
                </section>
              </div>
            </aside>
          ) : (
            <button
              onClick={() => setRightSidebarOpen(true)}
              className="hidden md:flex h-full w-8 items-start justify-center border-l border-white/10 bg-[#171922] pt-3 text-zinc-500 hover:text-zinc-200"
              title="Open context"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
          )}
        </div>

        {quickSwitcherOpen ? (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-[1px] flex items-start justify-center p-6">
            <div className="w-full max-w-2xl rounded-xl border border-white/10 bg-[#151821] shadow-[0_20px_70px_rgba(0,0,0,0.55)]">
              <div className="border-b border-white/10 p-3">
                <div className="flex items-center gap-2 rounded-md border border-white/10 bg-white/[0.03] px-3 py-2">
                  <Search className="h-4 w-4 text-zinc-500" />
                  <input
                    ref={quickInputRef}
                    value={quickSearch}
                    onChange={(e) => setQuickSearch(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key !== "Enter") return;
                      e.preventDefault();
                      if (commandMode) {
                        const command = filteredPaletteCommands.find((item) => !item.disabled);
                        if (command) {
                          command.run();
                          setQuickSwitcherOpen(false);
                          setQuickSearch("");
                        }
                        return;
                      }
                      const first = quickResults[0];
                      if (first) selectNote(first.path);
                    }}
                    placeholder="Quick switcher: notes, or type > for commands..."
                    className="w-full bg-transparent text-sm outline-none placeholder:text-zinc-500"
                  />
                </div>
                <div className="mt-2 text-[11px] text-zinc-500">
                  Press <kbd className="rounded border border-white/20 px-1">Esc</kbd> to close • <kbd className="rounded border border-white/20 px-1">Ctrl/Cmd + P</kbd> to open • <kbd className="rounded border border-white/20 px-1">Ctrl/Cmd + N</kbd> new note
                </div>
              </div>
              <div className="max-h-[55vh] overflow-auto p-2">
                {commandMode ? (
                  <>
                    <div className="px-3 py-1.5 text-[11px] uppercase tracking-[0.16em] text-zinc-500">Commands</div>
                    {filteredPaletteCommands.length ? filteredPaletteCommands.map((command) => (
                      <button
                        key={command.id}
                        onClick={() => {
                          if (command.disabled) return;
                          command.run();
                          setQuickSwitcherOpen(false);
                          setQuickSearch("");
                        }}
                        disabled={command.disabled}
                        className="w-full rounded-md px-3 py-2 text-left hover:bg-white/[0.06] disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        <div className="flex items-center gap-2">
                          <div className="text-sm text-zinc-100 truncate">{command.label}</div>
                          {command.shortcut ? (
                            <span className="rounded border border-white/15 px-1.5 py-0.5 text-[10px] text-zinc-500">{command.shortcut}</span>
                          ) : null}
                        </div>
                        <div className="text-[11px] text-zinc-500 truncate">{command.description}</div>
                      </button>
                    )) : (
                      <div className="px-3 py-3 text-sm text-zinc-500">No matching commands.</div>
                    )}
                  </>
                ) : (
                  <>
                    <div className="px-3 py-1.5 text-[11px] uppercase tracking-[0.16em] text-zinc-500">Notes</div>
                    {quickResults.length ? quickResults.map((note) => (
                      <button
                        key={note.path}
                        onClick={() => selectNote(note.path)}
                        className="w-full rounded-md px-3 py-2 text-left hover:bg-white/[0.06]"
                      >
                        <div className="text-sm text-zinc-100 truncate">{note.title}</div>
                        <div className="text-[11px] text-zinc-500 truncate">{note.vaultRelativePath}</div>
                      </button>
                    )) : (
                      <div className="px-3 py-3 text-sm text-zinc-500">No matching notes.</div>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </AppShell>
  );
}
