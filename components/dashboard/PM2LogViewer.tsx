"use client";
import { gatewayFetch } from "@/lib/gatewayFetch";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  RefreshCw, ArrowDown, Search, MessageSquare, X, ExternalLink,
} from "lucide-react";

interface PM2LogViewerProps {
  processName: string;
  open: boolean;
  onClose: () => void;
}

function colorLine(line: string) {
  const lower = line.toLowerCase();
  if (lower.includes("error") || lower.includes("err|") || lower.includes("fatal"))
    return "text-red-400";
  if (lower.includes("warn") || lower.includes("warning"))
    return "text-yellow-400";
  return "text-zinc-300";
}

export function PM2LogViewer({ processName, open, onClose }: PM2LogViewerProps) {
  const router = useRouter();
  const [logs, setLogs] = useState("");
  const [loading, setLoading] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const [search, setSearch] = useState("");
  const [showAskAgent, setShowAskAgent] = useState(false);
  const [selectedText, setSelectedText] = useState("");
  const [askQuestion, setAskQuestion] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await gatewayFetch(`/api/pm2/logs?name=${encodeURIComponent(processName)}&lines=200`);
      const data = await res.json();
      setLogs(data.logs || "");
    } catch {} finally { setLoading(false); }
  }, [processName]);

  useEffect(() => {
    if (open) fetchLogs();
  }, [open, fetchLogs]);

  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  const handleMouseUp = () => {
    const sel = window.getSelection()?.toString().trim();
    if (sel && sel.length > 0) {
      setSelectedText(sel);
      setShowAskAgent(true);
    } else {
      setShowAskAgent(false);
    }
  };

  const handleAskAgent = () => {
    const message = `[PM2 Log from ${processName}]\n\`\`\`\n${selectedText}\n\`\`\`\n${askQuestion}`;
    // Store in sessionStorage for the chat to pick up
    sessionStorage.setItem("pm2_ask_agent", message);
    onClose();
    router.push("/chat");
  };

  const lines = logs.split("\n");
  const filtered = search
    ? lines.filter(l => l.toLowerCase().includes(search.toLowerCase()))
    : lines;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-4xl max-h-[85vh] flex flex-col ">
        <DialogHeader>
          <DialogTitle className="text-zinc-200 flex items-center gap-2">
            Logs: {processName}
            <span className="text-xs text-zinc-500">({filtered.length} lines)</span>
            <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-zinc-400 hover:text-cyan-400 ml-1"
              title="Popout console"
              onClick={() => window.open(`/console/${encodeURIComponent(processName)}`, `${processName}-console`, 'width=900,height=600,menubar=no,toolbar=no,location=no,status=no')}>
              <ExternalLink className="w-3.5 h-3.5" />
            </Button>
          </DialogTitle>
        </DialogHeader>

        {/* Toolbar */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-2 top-2 w-4 h-4 text-zinc-500" />
            <Input
              placeholder="Filter logs..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 h-8 bg-white/[0.06] border-white/[0.08] text-sm text-zinc-200"
            />
          </div>
          <Button size="sm" variant="outline" onClick={fetchLogs} disabled={loading}
            className="border-white/[0.08] text-zinc-300 h-8">
            <RefreshCw className={`w-3.5 h-3.5 mr-1 ${loading ? "animate-spin" : ""}`} /> Refresh
          </Button>
          <Button size="sm" variant={autoScroll ? "default" : "outline"} onClick={() => setAutoScroll(!autoScroll)}
            className={`h-8 ${autoScroll ? "bg-blue-600" : "border-white/[0.08] text-zinc-300"}`}>
            <ArrowDown className="w-3.5 h-3.5 mr-1" /> Auto-scroll
          </Button>
        </div>

        {/* Log content */}
        <div
          ref={scrollRef}
          className="flex-1 overflow-auto bg-white/[0.03] rounded-lg p-3 font-mono text-xs select-text min-h-[300px] max-h-[55vh]"
          onMouseUp={handleMouseUp}
        >
          {filtered.map((line, i) => (
            <div key={i} className="flex gap-2 hover:bg-white/5 leading-5">
              <span className="text-zinc-600 select-none w-8 text-right shrink-0">{i + 1}</span>
              <span className={colorLine(line)}>{line}</span>
            </div>
          ))}
        </div>

        {/* Ask Agent floating panel */}
        {showAskAgent && (
          <div className="flex items-center gap-2 p-2 bg-white/[0.06] rounded-lg border border-white/[0.08]">
            <MessageSquare className="w-4 h-4 text-blue-400 shrink-0" />
            <Input
              placeholder="Ask about this log selection..."
              value={askQuestion}
              onChange={(e) => setAskQuestion(e.target.value)}
              className="h-8  text-sm text-zinc-200 flex-1"
              onKeyDown={(e) => e.key === "Enter" && handleAskAgent()}
            />
            <Button size="sm" onClick={handleAskAgent} className="h-8">
              Ask Agent
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setShowAskAgent(false)} className="h-8 text-zinc-400">
              <X className="w-3.5 h-3.5" />
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
