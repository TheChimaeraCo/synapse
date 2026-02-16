"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { AppShell } from "@/components/layout/AppShell";
import {
  Folder, FolderOpen, FileText, FileCode, FileImage, Archive,
  ChevronRight, ChevronDown, Search, Plus, FolderPlus, Upload,
  Save, Trash2, Copy, Scissors, ClipboardPaste, Download,
  Package, X, RefreshCw, File, MoreVertical, AlertCircle,
} from "lucide-react";

import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import { gatewayFetch } from "@/lib/gatewayFetch";

function getLanguage(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase() || "";
  const map: Record<string, string> = {
    ts: "typescript", tsx: "tsx", js: "javascript", jsx: "jsx",
    json: "json", md: "markdown", css: "css", html: "html",
    py: "python", rs: "rust", go: "go", sql: "sql",
    sh: "bash", bash: "bash", yml: "yaml", yaml: "yaml",
    toml: "toml", xml: "xml", svg: "xml", graphql: "graphql",
    prisma: "prisma", env: "bash", txt: "text",
  };
  return map[ext] || "text";
}
// Workspace path comes from gateway context via API

// File icon mapping
function getFileIcon(name: string, isDir: boolean, isOpen?: boolean) {
  if (isDir) return isOpen ? FolderOpen : Folder;
  const ext = name.split(".").pop()?.toLowerCase() || "";
  const map: Record<string, { icon: any; color: string }> = {
    ts: { icon: FileCode, color: "text-blue-400" },
    tsx: { icon: FileCode, color: "text-blue-400" },
    js: { icon: FileCode, color: "text-yellow-400" },
    jsx: { icon: FileCode, color: "text-yellow-400" },
    json: { icon: FileCode, color: "text-green-400" },
    md: { icon: FileText, color: "text-zinc-400" },
    css: { icon: FileCode, color: "text-purple-400" },
    html: { icon: FileCode, color: "text-orange-400" },
    png: { icon: FileImage, color: "text-pink-400" },
    jpg: { icon: FileImage, color: "text-pink-400" },
    jpeg: { icon: FileImage, color: "text-pink-400" },
    gif: { icon: FileImage, color: "text-pink-400" },
    svg: { icon: FileImage, color: "text-pink-400" },
    zip: { icon: Archive, color: "text-amber-400" },
    tar: { icon: Archive, color: "text-amber-400" },
  };
  const m = map[ext];
  return m ? m.icon : FileText;
}

function getIconColor(name: string, isDir: boolean) {
  if (isDir) return "text-blue-400";
  const ext = name.split(".").pop()?.toLowerCase() || "";
  const colors: Record<string, string> = {
    ts: "text-blue-400", tsx: "text-blue-400",
    js: "text-yellow-400", jsx: "text-yellow-400",
    json: "text-green-400", md: "text-zinc-400",
    css: "text-purple-400", html: "text-orange-400",
    png: "text-pink-400", jpg: "text-pink-400", jpeg: "text-pink-400",
    gif: "text-pink-400", svg: "text-pink-400",
    zip: "text-amber-400", tar: "text-amber-400",
  };
  return colors[ext] || "text-zinc-400";
}

function isTextFile(name: string) {
  const textExts = ["ts", "tsx", "js", "jsx", "json", "md", "css", "html", "txt", "yml", "yaml", "toml", "env", "sh", "bash", "py", "rs", "go", "sql", "xml", "svg", "csv", "log", "conf", "cfg", "ini", "gitignore", "dockerignore", "editorconfig", "prettierrc", "eslintrc", "lock", "prisma", "graphql", "gql"];
  const ext = name.split(".").pop()?.toLowerCase() || "";
  if (!ext || name.startsWith(".")) return true; // dotfiles are usually text
  return textExts.includes(ext);
}

function isImageFile(name: string) {
  const ext = name.split(".").pop()?.toLowerCase() || "";
  return ["png", "jpg", "jpeg", "gif", "svg", "webp", "ico"].includes(ext);
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

interface Entry {
  name: string;
  type: "file" | "directory";
  size: number;
  modified: string;
  extension: string;
  path?: string; // for search results
}

interface TreeNode {
  name: string;
  path: string;
  type: "file" | "directory";
  children?: TreeNode[];
  loaded?: boolean;
  expanded?: boolean;
}

// Context menu
interface ContextMenu {
  x: number;
  y: number;
  path: string;
  name: string;
  type: "file" | "directory";
}

export default function FilesPage() {
  const [currentPath, setCurrentPath] = useState("/");
  const [entries, setEntries] = useState<Entry[]>([]);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState("");
  const [originalContent, setOriginalContent] = useState("");
  const [fileInfo, setFileInfo] = useState<{ size: number; modified: string; extension: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Entry[] | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenu | null>(null);
  const [clipboard, setClipboard] = useState<{ path: string; action: "copy" | "cut" } | null>(null);
  const [showNewFileDialog, setShowNewFileDialog] = useState(false);
  const [showNewFolderDialog, setShowNewFolderDialog] = useState(false);
  const [newName, setNewName] = useState("");
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameName, setRenameName] = useState("");
  const [treeData, setTreeData] = useState<TreeNode[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [showMobileTree, setShowMobileTree] = useState(false);
  const [workspacePath, setWorkspacePath] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const editorScrollRef = useRef<HTMLDivElement>(null);

  // Browse directory
  const browse = useCallback(async (dirPath: string) => {
    setLoading(true);
    try {
      const res = await gatewayFetch(`/api/files/browse?path=${encodeURIComponent(dirPath)}`);
      const data = await res.json();
      if (data.entries) {
        setEntries(data.entries);
        setCurrentPath(dirPath);
        setSearchResults(null);
        if (data.workspacePath) setWorkspacePath(data.workspacePath);
      }
    } catch (err) {
      console.error("Browse error:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Load tree node children
  const loadTreeChildren = useCallback(async (dirPath: string): Promise<TreeNode[]> => {
    try {
      const res = await gatewayFetch(`/api/files/browse?path=${encodeURIComponent(dirPath)}`);
      const data = await res.json();
      return (data.entries || []).map((e: Entry) => ({
        name: e.name,
        path: dirPath === "/" ? e.name : `${dirPath}/${e.name}`,
        type: e.type,
        children: e.type === "directory" ? [] : undefined,
        loaded: false,
        expanded: false,
      }));
    } catch {
      return [];
    }
  }, []);

  // Init
  useEffect(() => {
    browse("/");
    loadTreeChildren("/").then(setTreeData);
  }, [browse, loadTreeChildren]);

  // Toggle tree node
  const toggleTreeNode = useCallback(async (nodePath: string) => {
    const updateNodes = async (nodes: TreeNode[]): Promise<TreeNode[]> => {
      return Promise.all(nodes.map(async (node) => {
        if (node.path === nodePath) {
          if (!node.loaded && node.type === "directory") {
            const children = await loadTreeChildren(node.path);
            return { ...node, expanded: true, loaded: true, children };
          }
          return { ...node, expanded: !node.expanded };
        }
        if (node.children) {
          return { ...node, children: await updateNodes(node.children) };
        }
        return node;
      }));
    };
    setTreeData(await updateNodes(treeData));
  }, [treeData, loadTreeChildren]);

  // Open file
  const openFile = useCallback(async (filePath: string) => {
    const name = filePath.split("/").pop() || "";
    if (!isTextFile(name) && !isImageFile(name)) {
      setSelectedFile(filePath);
      setFileContent("");
      setFileInfo({ size: 0, modified: "", extension: name.split(".").pop() || "" });
      return;
    }
    if (isImageFile(name)) {
      setSelectedFile(filePath);
      setFileContent("");
      setFileInfo({ size: 0, modified: "", extension: name.split(".").pop() || "" });
      return;
    }
    try {
      const res = await gatewayFetch("/api/files/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "read", path: filePath }),
      });
      const data = await res.json();
      if (data.content !== undefined) {
        setSelectedFile(filePath);
        setFileContent(data.content);
        setOriginalContent(data.content);
        setFileInfo({ size: data.size, modified: data.modified, extension: data.extension });
      }
    } catch (err) {
      console.error("Read error:", err);
    }
  }, []);

  // Save file
  const saveFile = useCallback(async () => {
    if (!selectedFile) return;
    setSaving(true);
    try {
      await gatewayFetch("/api/files/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "write", path: selectedFile, content: fileContent }),
      });
      setOriginalContent(fileContent);
    } catch (err) {
      console.error("Save error:", err);
    } finally {
      setSaving(false);
    }
  }, [selectedFile, fileContent]);

  // Ctrl+S
  useEffect(() => {
    const handler = (e: globalThis.KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        saveFile();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [saveFile]);

  // Search
  const doSearch = useCallback(async () => {
    if (!searchQuery.trim()) {
      setSearchResults(null);
      return;
    }
    try {
      const res = await gatewayFetch(`/api/files/browse?path=${encodeURIComponent(currentPath)}&search=${encodeURIComponent(searchQuery)}`);
      const data = await res.json();
      setSearchResults(data.entries || []);
    } catch {}
  }, [searchQuery, currentPath]);

  // File action helper
  const fileAction = useCallback(async (action: string, filePath: string, extra?: any) => {
    try {
      const res = await gatewayFetch("/api/files/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, path: filePath, ...extra }),
      });
      const data = await res.json();
      if (data.success || data.zipPath) {
        browse(currentPath);
        // Refresh tree
        loadTreeChildren("/").then(setTreeData);
      }
      return data;
    } catch (err) {
      console.error("Action error:", err);
    }
  }, [browse, currentPath, loadTreeChildren]);

  // Handle upload
  const handleUpload = useCallback(async (files: FileList) => {
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const formData = new FormData();
      formData.append("file", file);
      formData.append("path", currentPath);
      await gatewayFetch("/api/files/fs-upload", { method: "POST", body: formData });
    }
    browse(currentPath);
  }, [currentPath, browse]);

  // Close context menu on click
  useEffect(() => {
    const handler = () => setContextMenu(null);
    window.addEventListener("click", handler);
    return () => window.removeEventListener("click", handler);
  }, []);

  // Breadcrumbs
  const pathParts = currentPath === "/" ? [""] : currentPath.split("/");
  const breadcrumbs = pathParts.map((part, i) => ({
    label: part || "synapse",
    path: i === 0 ? "/" : pathParts.slice(0, i + 1).join("/"),
  }));

  const isModified = fileContent !== originalContent;
  const fileName = selectedFile?.split("/").pop() || "";

  // Tree component
  const renderTreeNode = (node: TreeNode, depth: number = 0) => {
    const Icon = getFileIcon(node.name, node.type === "directory", node.expanded);
    const color = getIconColor(node.name, node.type === "directory");
    const isSelected = selectedFile === node.path || currentPath === node.path;

    return (
      <div key={node.path}>
        <div
          className={`flex items-center gap-1 py-0.5 px-2 cursor-pointer hover:bg-white/[0.08] rounded text-sm ${isSelected ? "bg-white/[0.1]" : ""}`}
          style={{ paddingLeft: `${depth * 16 + 8}px` }}
          onClick={() => {
            if (node.type === "directory") {
              toggleTreeNode(node.path);
              browse(node.path);
            } else {
              openFile(node.path);
            }
          }}
          onContextMenu={(e) => {
            e.preventDefault();
            setContextMenu({ x: e.clientX, y: e.clientY, path: node.path, name: node.name, type: node.type });
          }}
        >
          {node.type === "directory" ? (
            node.expanded ? <ChevronDown className="w-3 h-3 text-zinc-500 shrink-0" /> : <ChevronRight className="w-3 h-3 text-zinc-500 shrink-0" />
          ) : (
            <span className="w-3 shrink-0" />
          )}
          <Icon className={`w-4 h-4 shrink-0 ${color}`} />
          <span className="truncate text-zinc-300">{node.name}</span>
        </div>
        {node.expanded && node.children?.map((child) => renderTreeNode(child, depth + 1))}
      </div>
    );
  };

  return (
    <AppShell title="Files">
    <div className="h-full flex flex-col bg-transparent text-white" onClick={() => setContextMenu(null)}>
      {/* Top toolbar */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-white/10 bg-white/[0.03]">
        {/* Mobile tree toggle */}
        <button className="md:hidden p-2.5 hover:bg-white/10 rounded min-w-[44px] min-h-[44px] flex items-center justify-center" onClick={() => setShowMobileTree(!showMobileTree)}>
          <Folder className="w-4 h-4" />
        </button>
        {/* Breadcrumbs */}
        <div className="flex items-center gap-1 text-sm text-zinc-400 overflow-x-auto">
          {breadcrumbs.map((b, i) => (
            <span key={b.path} className="flex items-center gap-1">
              {i > 0 && <span>/</span>}
              <button className="hover:text-white transition" onClick={() => browse(b.path)}>{b.label}</button>
            </span>
          ))}
        </div>
        <div className="flex-1" />
        <button className="p-1.5 hover:bg-white/10 rounded transition" title="New File" onClick={() => { setShowNewFileDialog(true); setNewName(""); }}>
          <Plus className="w-4 h-4 text-zinc-400" />
        </button>
        <button className="p-1.5 hover:bg-white/10 rounded transition" title="New Folder" onClick={() => { setShowNewFolderDialog(true); setNewName(""); }}>
          <FolderPlus className="w-4 h-4 text-zinc-400" />
        </button>
        <label className="p-1.5 hover:bg-white/10 rounded transition cursor-pointer" title="Upload">
          <Upload className="w-4 h-4 text-zinc-400" />
          <input type="file" className="hidden" multiple onChange={(e) => e.target.files && handleUpload(e.target.files)} />
        </label>
        <button className="p-1.5 hover:bg-white/10 rounded transition" title="Refresh" onClick={() => { browse(currentPath); loadTreeChildren("/").then(setTreeData); }}>
          <RefreshCw className="w-4 h-4 text-zinc-400" />
        </button>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Left panel - File tree */}
        <div className={`${showMobileTree ? "fixed inset-0 z-50 bg-black/50 md:relative md:bg-transparent flex" : "hidden md:block"} md:w-[280px] md:min-w-[280px] md:border-r md:border-white/10`}>
          <div className={`${showMobileTree ? "w-[280px] max-w-[80vw] h-full" : "h-full"} bg-white/[0.04] backdrop-blur-2xl flex flex-col shrink-0`}>
            {/* Search */}
            <div className="p-2 border-b border-white/10">
              <div className="flex items-center gap-2 px-2 py-1.5 bg-white/[0.06] rounded border border-white/10">
                <Search className="w-3.5 h-3.5 text-zinc-500" />
                <input
                  className="bg-transparent text-sm text-white outline-none w-full placeholder-zinc-500"
                  placeholder="Search files..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && doSearch()}
                />
                {searchQuery && (
                  <button onClick={() => { setSearchQuery(""); setSearchResults(null); }}>
                    <X className="w-3 h-3 text-zinc-500" />
                  </button>
                )}
              </div>
            </div>

            {/* Tree or search results */}
            <div className="flex-1 overflow-y-auto py-1">
              {searchResults ? (
                <div className="px-2">
                  <div className="text-xs text-zinc-500 px-2 py-1">{searchResults.length} results</div>
                  {searchResults.map((entry) => {
                    const Icon = getFileIcon(entry.name, entry.type === "directory");
                    const color = getIconColor(entry.name, entry.type === "directory");
                    return (
                      <div
                        key={entry.path}
                        className="flex items-center gap-2 py-1 px-2 hover:bg-white/[0.08] rounded cursor-pointer text-sm"
                        onClick={() => {
                          if (entry.type === "file" && entry.path) openFile(entry.path);
                          else if (entry.path) browse(entry.path);
                        }}
                      >
                        <Icon className={`w-4 h-4 ${color}`} />
                        <div className="truncate">
                          <div className="text-zinc-300">{entry.name}</div>
                          <div className="text-xs text-zinc-600">{entry.path}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                treeData.map((node) => renderTreeNode(node))
              )}
            </div>
          </div>
          {showMobileTree && <div className="flex-1 md:hidden" onClick={() => setShowMobileTree(false)} />}
        </div>

        {/* Right panel - Editor/Viewer */}
        <div
          className="flex-1 flex flex-col overflow-hidden"
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setDragOver(false); e.dataTransfer.files && handleUpload(e.dataTransfer.files); }}
        >
          {dragOver && (
            <div className="absolute inset-0 z-40 bg-blue-500/10 border-2 border-dashed border-blue-500/50 flex items-center justify-center">
              <div className="text-blue-400 text-lg font-medium">Drop files to upload</div>
            </div>
          )}

          {selectedFile ? (
            <>
              {/* File header */}
              <div className="flex items-center gap-2 px-4 py-2 border-b border-white/10 bg-white/[0.03]">
                <div className="flex items-center gap-1 text-sm text-zinc-400 flex-1">
                  {(() => { const Icon = getFileIcon(fileName, false); const color = getIconColor(fileName, false); return <Icon className={`w-4 h-4 ${color}`} />; })()}
                  <span className="text-zinc-300">{fileName}</span>
                  {isModified && <span className="text-amber-400 ml-1">*</span>}
                </div>
                {isTextFile(fileName) && (
                  <button
                    className={`flex items-center gap-1.5 px-3 py-1 rounded text-sm transition ${isModified ? "bg-blue-600 hover:bg-blue-500 text-white" : "bg-white/[0.06] text-zinc-500"}`}
                    onClick={saveFile}
                    disabled={!isModified || saving}
                  >
                    <Save className="w-3.5 h-3.5" />
                    {saving ? "Saving..." : "Save"}
                  </button>
                )}
                <a
                  href={`/api/files/download?path=${encodeURIComponent(selectedFile)}`}
                  className="p-1.5 hover:bg-white/10 rounded transition"
                  title="Download"
                >
                  <Download className="w-4 h-4 text-zinc-400" />
                </a>
                <button className="p-1.5 hover:bg-white/10 rounded transition" onClick={() => { setSelectedFile(null); setFileContent(""); }}>
                  <X className="w-4 h-4 text-zinc-400" />
                </button>
              </div>

              {/* Content */}
              <div className="flex-1 overflow-hidden">
                {isImageFile(fileName) ? (
                  <div className="flex items-center justify-center h-full p-8">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`/api/files/download?path=${encodeURIComponent(selectedFile)}`}
                      alt={fileName}
                      className="max-w-full max-h-full object-contain rounded"
                    />
                  </div>
                ) : isTextFile(fileName) ? (
                  <div className="relative w-full h-full overflow-hidden">
                    <div
                      ref={editorScrollRef}
                      className="absolute inset-0 overflow-auto"
                      onScroll={() => {
                        if (textareaRef.current && editorScrollRef.current) {
                          textareaRef.current.scrollTop = editorScrollRef.current.scrollTop;
                          textareaRef.current.scrollLeft = editorScrollRef.current.scrollLeft;
                        }
                      }}
                    >
                      <div className="relative" style={{ minHeight: "100%" }}>
                        {/* Syntax highlighted layer */}
                        <SyntaxHighlighter
                          style={oneDark}
                          language={getLanguage(fileName)}
                          PreTag="div"
                          customStyle={{
                            margin: 0,
                            padding: "1rem",
                            background: "transparent",
                            fontSize: "0.875rem",
                            lineHeight: "1.625",
                            minHeight: "100%",
                          }}
                          codeTagProps={{ style: { background: "transparent" } }}
                        >
                          {fileContent + "\n"}
                        </SyntaxHighlighter>
                      </div>
                    </div>
                    {/* Editable textarea on top - matches exact same size */}
                    <textarea
                      ref={textareaRef}
                      className="absolute inset-0 w-full h-full bg-transparent text-transparent caret-zinc-300 font-mono text-sm p-4 outline-none resize-none leading-relaxed selection:bg-blue-500/30 overflow-auto"
                      style={{ whiteSpace: "pre", wordWrap: "normal" }}
                      value={fileContent}
                      onChange={(e) => setFileContent(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Tab") {
                          e.preventDefault();
                          const start = e.currentTarget.selectionStart;
                          const end = e.currentTarget.selectionEnd;
                          const newContent = fileContent.substring(0, start) + "  " + fileContent.substring(end);
                          setFileContent(newContent);
                          setTimeout(() => {
                            if (textareaRef.current) {
                              textareaRef.current.selectionStart = textareaRef.current.selectionEnd = start + 2;
                            }
                          }, 0);
                        }
                      }}
                      onScroll={() => {
                        if (editorScrollRef.current && textareaRef.current) {
                          editorScrollRef.current.scrollTop = textareaRef.current.scrollTop;
                          editorScrollRef.current.scrollLeft = textareaRef.current.scrollLeft;
                        }
                      }}
                      spellCheck={false}
                    />
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center h-full gap-4 text-zinc-500">
                    <File className="w-16 h-16" />
                    <div className="text-lg">{fileName}</div>
                    <div className="text-sm">Binary file - cannot preview</div>
                    <a
                      href={`/api/files/download?path=${encodeURIComponent(selectedFile)}`}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded transition text-sm"
                    >
                      Download
                    </a>
                  </div>
                )}
              </div>

              {/* File info bar */}
              {fileInfo && (
                <div className="flex items-center gap-4 px-4 py-1.5 border-t border-white/10 bg-white/[0.03] text-xs text-zinc-500">
                  <span>{fileInfo.extension || "no ext"}</span>
                  <span>{formatSize(fileInfo.size)}</span>
                  {fileInfo.modified && <span>{new Date(fileInfo.modified).toLocaleString()}</span>}
                  {isTextFile(fileName) && <span>{fileContent.split("\n").length} lines</span>}
                </div>
              )}
            </>
          ) : (
            /* No file selected - show directory listing */
            <div className="flex-1 overflow-y-auto p-4">
              <div className="grid gap-1">
                {currentPath !== "/" && (
                  <div
                    className="flex items-center gap-3 px-3 py-2 hover:bg-white/[0.08] rounded cursor-pointer"
                    onClick={() => {
                      const parent = currentPath.split("/").slice(0, -1).join("/") || "/";
                      browse(parent);
                    }}
                  >
                    <Folder className="w-4 h-4 text-zinc-500" />
                    <span className="text-sm text-zinc-400">..</span>
                  </div>
                )}
                {entries.map((entry) => {
                  const Icon = getFileIcon(entry.name, entry.type === "directory");
                  const color = getIconColor(entry.name, entry.type === "directory");
                  return (
                    <div
                      key={entry.name}
                      className="flex items-center gap-3 px-3 py-2 hover:bg-white/[0.08] rounded cursor-pointer group"
                      onClick={() => {
                        if (entry.type === "directory") {
                          const newPath = currentPath === "/" ? entry.name : `${currentPath}/${entry.name}`;
                          browse(newPath);
                        } else {
                          const filePath = currentPath === "/" ? entry.name : `${currentPath}/${entry.name}`;
                          openFile(filePath);
                        }
                      }}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        const fp = currentPath === "/" ? entry.name : `${currentPath}/${entry.name}`;
                        setContextMenu({ x: e.clientX, y: e.clientY, path: fp, name: entry.name, type: entry.type });
                      }}
                    >
                      <Icon className={`w-4 h-4 ${color}`} />
                      <span className="text-sm text-zinc-300 flex-1">{entry.name}</span>
                      <span className="text-xs text-zinc-600">{entry.type === "file" ? formatSize(entry.size) : ""}</span>
                      <span className="text-xs text-zinc-600 hidden sm:inline">{entry.modified ? new Date(entry.modified).toLocaleDateString() : ""}</span>
                    </div>
                  );
                })}
                {entries.length === 0 && !loading && (
                  <div className="text-center text-zinc-600 py-12">Empty directory</div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Status bar */}
      <div className="flex items-center gap-4 px-4 py-1 border-t border-white/10 bg-white/[0.03] text-xs text-zinc-500">
        <span>{currentPath === "/" ? "synapse" : currentPath}</span>
        <span>{entries.length} items</span>
        {selectedFile && <span>{selectedFile}</span>}
        {clipboard && <span className="text-amber-400">Clipboard: {clipboard.action} {clipboard.path.split("/").pop()}</span>}
      </div>

      {/* Context menu */}
      {contextMenu && (
        <div
          className="fixed z-50 bg-white/[0.07] backdrop-blur-3xl border border-white/[0.12] rounded-2xl shadow-[0_16px_64px_rgba(0,0,0,0.4)] py-1 min-w-[180px] max-w-[calc(100vw-1rem)]"
          style={{ left: Math.min(contextMenu.x, window.innerWidth - 200), top: Math.min(contextMenu.y, window.innerHeight - 300) }}
          onClick={(e) => e.stopPropagation()}
        >
          {[
            { label: "New File", icon: Plus, action: () => { setShowNewFileDialog(true); setNewName(""); setContextMenu(null); } },
            { label: "New Folder", icon: FolderPlus, action: () => { setShowNewFolderDialog(true); setNewName(""); setContextMenu(null); } },
            null,
            { label: "Rename", icon: FileText, action: () => { setRenaming(contextMenu.path); setRenameName(contextMenu.name); setContextMenu(null); } },
            { label: "Copy", icon: Copy, action: () => { setClipboard({ path: contextMenu.path, action: "copy" }); setContextMenu(null); } },
            { label: "Cut", icon: Scissors, action: () => { setClipboard({ path: contextMenu.path, action: "cut" }); setContextMenu(null); } },
            ...(clipboard ? [{ label: "Paste", icon: ClipboardPaste, action: async () => {
              const destDir = contextMenu.type === "directory" ? contextMenu.path : currentPath;
              const dest = destDir === "/" ? clipboard.path.split("/").pop()! : `${destDir}/${clipboard.path.split("/").pop()}`;
              if (clipboard.action === "copy") {
                await fileAction("copy", clipboard.path, { destination: dest });
              } else {
                await fileAction("move", clipboard.path, { destination: dest });
              }
              setClipboard(null);
              setContextMenu(null);
            }}] : []),
            null,
            { label: "Zip", icon: Package, action: async () => { await fileAction("zip", contextMenu.path); setContextMenu(null); } },
            { label: "Delete", icon: Trash2, action: async () => {
              if (confirm(`Delete ${contextMenu.name}?`)) {
                await fileAction("delete", contextMenu.path);
                if (selectedFile === contextMenu.path) {
                  setSelectedFile(null);
                  setFileContent("");
                }
              }
              setContextMenu(null);
            }, danger: true },
          ].map((item, i) => item === null ? (
            <div key={`sep-${i}`} className="border-t border-white/10 my-1" />
          ) : (
            <button
              key={item.label}
              className={`flex items-center gap-2 w-full px-3 py-1.5 text-sm text-left hover:bg-white/[0.08] transition ${(item as any).danger ? "text-red-400" : "text-zinc-300"}`}
              onClick={item.action}
            >
              <item.icon className="w-3.5 h-3.5" />
              {item.label}
            </button>
          ))}
        </div>
      )}

      {/* New File Dialog */}
      {showNewFileDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowNewFileDialog(false)}>
          <div className="bg-white/[0.07] backdrop-blur-3xl border border-white/10 rounded-xl p-4 w-80" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-medium text-zinc-300 mb-3">New File</h3>
            <input
              className="w-full bg-white/[0.04] border border-white/[0.08] rounded px-3 py-2 text-sm text-white outline-none focus:border-blue-500"
              placeholder="filename.ts"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && newName) {
                  const fp = currentPath === "/" ? newName : `${currentPath}/${newName}`;
                  fileAction("write", fp, { content: "" });
                  setShowNewFileDialog(false);
                }
              }}
              autoFocus
            />
            <div className="flex justify-end gap-2 mt-3">
              <button className="px-3 py-1.5 text-sm text-zinc-400 hover:text-white" onClick={() => setShowNewFileDialog(false)}>Cancel</button>
              <button
                className="px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-500 text-white rounded"
                onClick={() => {
                  if (newName) {
                    const fp = currentPath === "/" ? newName : `${currentPath}/${newName}`;
                    fileAction("write", fp, { content: "" });
                    setShowNewFileDialog(false);
                  }
                }}
              >Create</button>
            </div>
          </div>
        </div>
      )}

      {/* New Folder Dialog */}
      {showNewFolderDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowNewFolderDialog(false)}>
          <div className="bg-white/[0.07] backdrop-blur-3xl border border-white/10 rounded-xl p-4 w-80" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-medium text-zinc-300 mb-3">New Folder</h3>
            <input
              className="w-full bg-white/[0.04] border border-white/[0.08] rounded px-3 py-2 text-sm text-white outline-none focus:border-blue-500"
              placeholder="folder-name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && newName) {
                  const fp = currentPath === "/" ? newName : `${currentPath}/${newName}`;
                  fileAction("mkdir", fp);
                  setShowNewFolderDialog(false);
                }
              }}
              autoFocus
            />
            <div className="flex justify-end gap-2 mt-3">
              <button className="px-3 py-1.5 text-sm text-zinc-400 hover:text-white" onClick={() => setShowNewFolderDialog(false)}>Cancel</button>
              <button
                className="px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-500 text-white rounded"
                onClick={() => {
                  if (newName) {
                    const fp = currentPath === "/" ? newName : `${currentPath}/${newName}`;
                    fileAction("mkdir", fp);
                    setShowNewFolderDialog(false);
                  }
                }}
              >Create</button>
            </div>
          </div>
        </div>
      )}

      {/* Rename Dialog */}
      {renaming && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setRenaming(null)}>
          <div className="bg-white/[0.07] backdrop-blur-3xl border border-white/10 rounded-xl p-4 w-80" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-medium text-zinc-300 mb-3">Rename</h3>
            <input
              className="w-full bg-white/[0.04] border border-white/[0.08] rounded px-3 py-2 text-sm text-white outline-none focus:border-blue-500"
              value={renameName}
              onChange={(e) => setRenameName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && renameName) {
                  const dir = renaming.split("/").slice(0, -1).join("/") || currentPath;
                  const dest = dir === "/" ? renameName : `${dir}/${renameName}`;
                  fileAction("move", renaming, { destination: dest });
                  setRenaming(null);
                }
              }}
              autoFocus
            />
            <div className="flex justify-end gap-2 mt-3">
              <button className="px-3 py-1.5 text-sm text-zinc-400 hover:text-white" onClick={() => setRenaming(null)}>Cancel</button>
              <button
                className="px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-500 text-white rounded"
                onClick={() => {
                  if (renameName) {
                    const dir = renaming.split("/").slice(0, -1).join("/") || currentPath;
                    const dest = dir === "/" ? renameName : `${dir}/${renameName}`;
                    fileAction("move", renaming, { destination: dest });
                    setRenaming(null);
                  }
                }}
              >Rename</button>
            </div>
          </div>
        </div>
      )}
    </div>
    </AppShell>
  );
}
