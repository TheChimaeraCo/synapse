"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { gatewayFetch } from "@/lib/gatewayFetch";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ShieldAlert, CheckCircle2, XCircle, RefreshCw } from "lucide-react";
import { toast } from "sonner";

interface ApprovalRecord {
  _id: string;
  sessionId: string;
  toolName: string;
  toolArgs: Record<string, unknown>;
  requestedAt: number;
  status: "pending" | "approved" | "denied";
}

function formatArgs(args: Record<string, unknown> | undefined): string {
  try {
    const raw = JSON.stringify(args || {}, null, 2);
    return raw.length > 1200 ? `${raw.slice(0, 1200)}\n...` : raw;
  } catch {
    return "{}";
  }
}

export function ToolApprovalsPopup({ sessionId }: { sessionId: string }) {
  const [approvals, setApprovals] = useState<ApprovalRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [resolvingId, setResolvingId] = useState<string | null>(null);

  const fetchApprovals = useCallback(async () => {
    if (!sessionId || forbidden) return;
    try {
      const res = await gatewayFetch(`/api/approvals?sessionId=${encodeURIComponent(sessionId)}`);
      if (res.status === 403) {
        setForbidden(true);
        setApprovals([]);
        return;
      }
      if (!res.ok) throw new Error("Failed to fetch approvals");
      const data = await res.json();
      setApprovals((data.approvals || []) as ApprovalRecord[]);
    } catch {
      // Non-fatal: keep current state, try again next poll.
    } finally {
      setLoading(false);
    }
  }, [sessionId, forbidden]);

  useEffect(() => {
    setLoading(true);
    setForbidden(false);
    setApprovals([]);
    void fetchApprovals();
  }, [fetchApprovals]);

  useEffect(() => {
    if (forbidden) return;
    const interval = setInterval(() => {
      void fetchApprovals();
    }, 4000);
    return () => clearInterval(interval);
  }, [fetchApprovals, forbidden]);

  useEffect(() => {
    const handler = () => {
      void fetchApprovals();
    };
    window.addEventListener("synapse:assistant_stream_done", handler);
    return () => window.removeEventListener("synapse:assistant_stream_done", handler);
  }, [fetchApprovals]);

  const topApproval = approvals[0];
  const remaining = useMemo(() => Math.max(0, approvals.length - 1), [approvals.length]);

  const resolveApproval = useCallback(async (approvalId: string, status: "approved" | "denied") => {
    setResolvingId(approvalId);
    try {
      const res = await gatewayFetch(`/api/approvals/${approvalId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || "Failed to resolve approval");
      setApprovals((prev) => prev.filter((row) => row._id !== approvalId));
      toast.success(status === "approved" ? "Tool approved" : "Tool denied");
      window.dispatchEvent(
        new CustomEvent("synapse:tool_approval_resolved", {
          detail: { approvalId, status, sessionId },
        }),
      );
    } catch (err: any) {
      toast.error(err?.message || "Failed to resolve approval");
    } finally {
      setResolvingId(null);
    }
  }, [sessionId]);

  if (forbidden) return null;
  if (!loading && approvals.length === 0) return null;

  return (
    <div className="fixed bottom-24 right-4 md:right-6 z-40 w-[min(28rem,calc(100vw-2rem))]">
      <div className="rounded-2xl border border-amber-400/30 bg-black/70 backdrop-blur-2xl shadow-[0_14px_50px_rgba(0,0,0,0.45)]">
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.08]">
          <div className="flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 text-amber-300" />
            <span className="text-sm font-semibold text-zinc-100">Tool Approval Required</span>
            {approvals.length > 0 && <Badge variant="secondary">{approvals.length}</Badge>}
          </div>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-zinc-300"
            onClick={() => void fetchApprovals()}
            disabled={loading}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>

        {topApproval ? (
          <div className="p-4 space-y-3">
            <div>
              <div className="text-sm text-white font-medium">{topApproval.toolName}</div>
              <div className="text-[11px] text-zinc-400 mt-1">
                Requested {new Date(topApproval.requestedAt).toLocaleString()}
              </div>
            </div>

            <pre className="max-h-44 overflow-auto rounded-lg bg-black/40 border border-white/[0.08] p-2 text-[11px] text-zinc-300 whitespace-pre-wrap break-all">
              {formatArgs(topApproval.toolArgs)}
            </pre>

            <div className="flex items-center gap-2">
              <Button
                size="sm"
                className="bg-emerald-600 hover:bg-emerald-500 text-white"
                onClick={() => void resolveApproval(topApproval._id, "approved")}
                disabled={resolvingId === topApproval._id}
              >
                <CheckCircle2 className="h-4 w-4 mr-1" />
                Approve
              </Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={() => void resolveApproval(topApproval._id, "denied")}
                disabled={resolvingId === topApproval._id}
              >
                <XCircle className="h-4 w-4 mr-1" />
                Deny
              </Button>
            </div>

            {remaining > 0 && (
              <div className="text-[11px] text-zinc-400">
                {remaining} more pending in this chat session.
              </div>
            )}
          </div>
        ) : (
          <div className="p-4 text-sm text-zinc-400">Checking for pending approvals...</div>
        )}
      </div>
    </div>
  );
}

