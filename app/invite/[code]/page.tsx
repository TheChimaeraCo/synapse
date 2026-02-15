"use client";

import { useState, useEffect, use } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Loader2, Server, CheckCircle2, XCircle, UserPlus } from "lucide-react";
import { cn } from "@/lib/utils";

interface InviteInfo {
  valid: boolean;
  error?: string;
  gateway?: { name: string; slug: string; icon?: string };
  role?: string;
  expiresAt?: number;
}

export default function InvitePage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = use(params);
  const { data: session, status: authStatus } = useSession();
  const router = useRouter();
  const [invite, setInvite] = useState<InviteInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [joined, setJoined] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/invites/${code}`);
        const data = await res.json();
        setInvite(data);
      } catch {
        setInvite({ valid: false, error: "Failed to validate invite" });
      } finally {
        setLoading(false);
      }
    })();
  }, [code]);

  const handleJoin = async () => {
    setJoining(true);
    setError(null);
    try {
      const res = await fetch(`/api/invites/${code}`, { method: "POST" });
      if (res.ok) {
        setJoined(true);
        // Auto-switch to the new gateway after a moment
        setTimeout(() => router.push("/chat"), 1500);
      } else {
        const data = await res.json();
        setError(data.error || "Failed to join");
      }
    } catch {
      setError("Failed to join gateway");
    } finally {
      setJoining(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#0a0a12] via-[#0d0d1a] to-[#0a0f18]">
        <Loader2 className="h-8 w-8 animate-spin text-zinc-500" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#0a0a12] via-[#0d0d1a] to-[#0a0f18] p-4">
      <div className="bg-white/[0.04] backdrop-blur-3xl border border-white/[0.08] rounded-2xl p-8 max-w-sm w-full text-center shadow-[0_16px_64px_rgba(0,0,0,0.4)]">
        {!invite?.valid ? (
          <>
            <XCircle className="mx-auto h-12 w-12 text-red-400 mb-4" />
            <h1 className="text-xl font-semibold text-zinc-200 mb-2">Invalid Invite</h1>
            <p className="text-sm text-zinc-400 mb-6">{invite?.error || "This invite link is invalid or has expired."}</p>
            <Button onClick={() => router.push("/")} variant="ghost" className="text-zinc-400">
              Go Home
            </Button>
          </>
        ) : joined ? (
          <>
            <CheckCircle2 className="mx-auto h-12 w-12 text-green-400 mb-4" />
            <h1 className="text-xl font-semibold text-zinc-200 mb-2">Joined!</h1>
            <p className="text-sm text-zinc-400">Redirecting to {invite.gateway?.name}...</p>
          </>
        ) : (
          <>
            <div className="flex items-center justify-center mb-4">
              <span className="flex items-center justify-center h-16 w-16 rounded-2xl bg-white/[0.06] border border-white/[0.1] text-2xl font-bold text-zinc-200 shadow-[0_0_30px_rgba(59,130,246,0.1)]">
                {invite.gateway?.icon || invite.gateway?.name?.charAt(0) || <Server className="h-8 w-8" />}
              </span>
            </div>
            <h1 className="text-xl font-semibold text-zinc-200 mb-1">
              You've been invited to
            </h1>
            <p className="text-lg font-bold text-blue-400 mb-1">{invite.gateway?.name}</p>
            {invite.role && (
              <p className="text-sm text-zinc-500 mb-6">
                as <span className="text-zinc-300 capitalize">{invite.role}</span>
              </p>
            )}

            {error && (
              <div className="mb-4 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2 text-sm text-red-400">
                {error}
              </div>
            )}

            {authStatus === "authenticated" ? (
              <Button
                onClick={handleJoin}
                disabled={joining}
                className="w-full"
              >
                {joining ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-1" />
                ) : (
                  <UserPlus className="h-4 w-4 mr-1" />
                )}
                Join Gateway
              </Button>
            ) : (
              <div className="space-y-3">
                <Button
                  onClick={() => router.push(`/register?invite=${code}`)}
                  className="w-full"
                >
                  Create Account to Join
                </Button>
                <Button
                  onClick={() => router.push(`/api/auth/signin?callbackUrl=/invite/${code}`)}
                  variant="ghost"
                  className="w-full text-zinc-400"
                >
                  Sign In
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
