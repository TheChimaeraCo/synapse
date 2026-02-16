"use client";

import { useSession } from "next-auth/react";
import { useState, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";
import { Clock, FileText, Trash2, ChevronDown, ChevronRight, AlertCircle, RefreshCw } from "lucide-react";

function formatMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleString();
}

function formatJson(str: string): string {
  try {
    return JSON.stringify(JSON.parse(str), null, 2);
  } catch {
    return str;
  }
}

export default function ParseHistoryPage() {
  const { data: session } = useSession();
  const [records, setRecords] = useState<any[] | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchRecords = useCallback(async () => {
    try {
      const res = await fetch("/api/parse-history");
      if (res.ok) {
        setRecords(await res.json());
      }
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchRecords();
  }, [fetchRecords]);

  const handleClearAll = async () => {
    await fetch("/api/parse-history", { method: "DELETE" });
    setShowClearConfirm(false);
    fetchRecords();
  };

  const handleRemove = async (id: string) => {
    await fetch(`/api/parse-history?id=${id}`, { method: "DELETE" });
    fetchRecords();
  };

  return (
    <div className="min-h-screen p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center h-10 w-10 rounded-xl bg-white/[0.07] border border-white/10">
            <Clock className="h-5 w-5 text-blue-400" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-white">Parse History</h1>
            <p className="text-sm text-white/60">PDF parse request log</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchRecords}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/[0.07] text-white/60 text-sm hover:bg-white/[0.12] transition border border-white/10"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </button>
          {records && records.length > 0 && (
            <>
              {showClearConfirm ? (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-white/60">Clear all?</span>
                  <button
                    onClick={handleClearAll}
                    className="px-3 py-1.5 rounded-lg bg-red-500/20 text-red-400 text-sm hover:bg-red-500/30 transition border border-red-500/20"
                  >
                    Confirm
                  </button>
                  <button
                    onClick={() => setShowClearConfirm(false)}
                    className="px-3 py-1.5 rounded-lg bg-white/[0.07] text-white/60 text-sm hover:bg-white/[0.12] transition border border-white/10"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setShowClearConfirm(true)}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/[0.07] text-white/60 text-sm hover:bg-white/[0.12] transition border border-white/10"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Clear All
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="bg-white/[0.07] border border-white/10 backdrop-blur-xl rounded-xl p-8 text-center">
          <p className="text-white/60">Loading...</p>
        </div>
      ) : !records || records.length === 0 ? (
        <div className="bg-white/[0.07] border border-white/10 backdrop-blur-xl rounded-xl p-12 text-center space-y-3">
          <FileText className="h-12 w-12 text-white/20 mx-auto" />
          <p className="text-white/60 text-lg">No parse history yet</p>
          <p className="text-white/40 text-sm">PDF parse requests will appear here</p>
        </div>
      ) : (
        <div className="bg-white/[0.07] border border-white/10 backdrop-blur-xl rounded-xl overflow-hidden">
          {/* Table header */}
          <div className="grid grid-cols-[auto_1fr_auto_auto_auto_auto_auto] gap-4 px-4 py-3 border-b border-white/10 text-xs text-white/40 font-medium uppercase tracking-wider">
            <div className="w-5" />
            <div>File</div>
            <div>Status</div>
            <div>Items</div>
            <div>Time</div>
            <div>Model</div>
            <div className="w-8" />
          </div>

          {/* Rows */}
          {records.map((record: any) => {
            const isExpanded = expandedId === record._id;
            return (
              <div key={record._id} className="border-b border-white/[0.05] last:border-0">
                <button
                  onClick={() => setExpandedId(isExpanded ? null : record._id)}
                  className="w-full grid grid-cols-[auto_1fr_auto_auto_auto_auto_auto] gap-4 px-4 py-3 text-sm hover:bg-white/[0.04] transition items-center text-left"
                >
                  <div className="w-5">
                    {isExpanded ? (
                      <ChevronDown className="h-4 w-4 text-white/40" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-white/40" />
                    )}
                  </div>
                  <div className="truncate">
                    <span className="text-white">{record.fileName}</span>
                    <span className="text-white/30 ml-2 text-xs">{formatBytes(record.fileSize)}</span>
                    <div className="text-xs text-white/30 mt-0.5">{formatTime(record._creationTime)}</div>
                  </div>
                  <div>
                    <span
                      className={cn(
                        "px-2 py-0.5 rounded-full text-xs font-medium",
                        record.status === "success"
                          ? "bg-green-500/20 text-green-400"
                          : "bg-red-500/20 text-red-400"
                      )}
                    >
                      {record.status}
                    </span>
                  </div>
                  <div className="text-white/60 text-xs tabular-nums">
                    {record.itemCount ?? "-"}
                  </div>
                  <div className="text-white/60 text-xs tabular-nums">
                    {formatMs(record.processingMs)}
                  </div>
                  <div className="text-white/40 text-xs truncate max-w-[120px]">
                    {record.model || "-"}
                  </div>
                  <div className="w-8">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRemove(record._id);
                      }}
                      className="p-1 rounded hover:bg-red-500/20 text-white/20 hover:text-red-400 transition"
                      title="Delete"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </button>

                {/* Expanded details */}
                {isExpanded && (
                  <div className="px-4 pb-4 space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <DetailCard label="Text Length" value={`${record.textLength?.toLocaleString() || 0} chars`} />
                      <DetailCard label="Provider" value={record.provider || "-"} />
                      {record.sourceIp && <DetailCard label="Source IP" value={record.sourceIp} />}
                      {record.prompt && <DetailCard label="Prompt" value={record.prompt} span2 />}
                    </div>

                    {record.error && (
                      <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4">
                        <div className="flex items-center gap-2 text-red-400 text-xs font-medium mb-2">
                          <AlertCircle className="h-3.5 w-3.5" />
                          Error
                        </div>
                        <pre className="text-red-300 text-xs whitespace-pre-wrap">{record.error}</pre>
                      </div>
                    )}

                    <div className="space-y-2">
                      <p className="text-xs text-white/40 font-medium uppercase tracking-wider">Schema</p>
                      <pre className="bg-white/[0.04] border border-white/[0.06] rounded-xl p-4 text-xs text-white/70 overflow-x-auto max-h-60 overflow-y-auto whitespace-pre-wrap">
                        {formatJson(record.schema)}
                      </pre>
                    </div>

                    {record.result && (
                      <div className="space-y-2">
                        <p className="text-xs text-white/40 font-medium uppercase tracking-wider">Result</p>
                        <pre className="bg-white/[0.04] border border-white/[0.06] rounded-xl p-4 text-xs text-green-300/80 overflow-x-auto max-h-80 overflow-y-auto whitespace-pre-wrap">
                          {formatJson(record.result)}
                        </pre>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function DetailCard({ label, value, span2 }: { label: string; value: string; span2?: boolean }) {
  return (
    <div className={cn("bg-white/[0.04] border border-white/[0.06] rounded-xl p-3", span2 && "col-span-2")}>
      <p className="text-[10px] text-white/40 uppercase tracking-wider mb-1">{label}</p>
      <p className="text-sm text-white/80 break-all">{value}</p>
    </div>
  );
}
