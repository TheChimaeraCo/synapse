"use client";

import { useState, useEffect } from "react";
import { signIn } from "next-auth/react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Zap, ShieldAlert } from "lucide-react";
import { toast } from "sonner";

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const searchParams = useSearchParams();
  const inviteCode = searchParams.get("invite");
  const [inviteGateway, setInviteGateway] = useState<string | null>(null);
  const [inviteValid, setInviteValid] = useState<boolean | null>(null);

  useEffect(() => {
    if (!inviteCode) {
      if (mode === "register") setInviteValid(false);
      return;
    }
    fetch(`/api/invites/${inviteCode}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.valid && data.gateway) {
          setInviteGateway(data.gateway.name);
          setInviteValid(true);
        } else {
          setInviteValid(false);
        }
      })
      .catch(() => setInviteValid(false));
  }, [inviteCode, mode]);

  // Registration without invite - show blocked message
  if (mode === "register" && !inviteCode) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4 bg-gradient-to-br from-[#0a0a12] via-[#0d0d1a] to-[#0a0f18]">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-white/[0.06] border border-white/[0.08]">
              <ShieldAlert className="h-7 w-7 text-zinc-400" />
            </div>
            <CardTitle className="text-xl text-zinc-100">Invite Required</CardTitle>
            <p className="text-sm text-zinc-400 mt-2">
              You need an invite link to create an account. Ask a gateway admin for one.
            </p>
          </CardHeader>
          <CardContent>
            <Link href="/login">
              <Button className="w-full">
                Back to Login
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      if (mode === "register") {
        const res = await fetch("/api/auth/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: email.trim().toLowerCase(),
            password,
            name,
            inviteCode: inviteCode || undefined,
          }),
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || "Registration failed");
        }

        const result = await res.json();

        // If registration returned a gateway, set it as active
        if (result.gatewayId) {
          localStorage.setItem("synapse-active-gateway", result.gatewayId);
          document.cookie = `synapse-active-gateway=${result.gatewayId}; path=/; max-age=31536000; samesite=lax`;
        }
      }

      // Raw form POST for auth
      const csrfRes = await fetch("/api/auth/csrf");
      const { csrfToken } = await csrfRes.json();

      const form = document.createElement("form");
      form.method = "POST";
      form.action = "/api/auth/callback/credentials";
      
      const fields: Record<string, string> = {
        csrfToken,
        email: email.trim().toLowerCase(),
        password,
        callbackUrl: "/",
      };
      
      for (const [key, value] of Object.entries(fields)) {
        const input = document.createElement("input");
        input.type = "hidden";
        input.name = key;
        input.value = value;
        form.appendChild(input);
      }
      
      document.body.appendChild(form);
      form.submit();
    } catch (err: any) {
      setError(err.message || "Sign in failed");
      toast.error(err.message || "Sign in failed");
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-4 bg-gradient-to-br from-[#0a0a12] via-[#0d0d1a] to-[#0a0f18]">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500/15 to-purple-500/15 border border-white/[0.1] shadow-[0_0_30px_rgba(59,130,246,0.15)]">
            <Zap className="h-7 w-7 text-blue-400" />
          </div>
          <CardTitle className="text-xl text-zinc-100">
            {mode === "login" ? "Welcome back" : "Create an account"}
          </CardTitle>
          <p className="text-sm text-zinc-400">
            {mode === "login"
              ? "Sign in to your Synapse Hub"
              : "Get started with Synapse Hub"}
          </p>
        </CardHeader>
        <CardContent>
          {inviteGateway && mode === "register" && (
            <div className="mb-4 bg-blue-500/[0.08] border border-blue-500/20 rounded-xl px-4 py-3 text-sm text-blue-300 text-center">
              You've been invited to <span className="font-semibold">{inviteGateway}</span>
            </div>
          )}
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            {mode === "register" && (
              <div>
                <label className="mb-1.5 block text-sm font-medium text-zinc-300">Name</label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" required
                  className="" />
              </div>
            )}
            <div>
              <label className="mb-1.5 block text-sm font-medium text-zinc-300">Email</label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" required
                className="" />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-zinc-300">Password</label>
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Min. 8 characters" minLength={8} required
                className="" />
            </div>
            {error && <p className="text-sm text-red-400 text-center">{error}</p>}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Signing in..." : mode === "login" ? "Sign in" : "Create account"}
            </Button>
          </form>
          <p className="mt-4 text-center text-sm text-zinc-500">
            {mode === "login" ? (
              <>
                Don&apos;t have an account?{" "}
                <Link href="/register" className="text-blue-400 hover:underline">Register</Link>
              </>
            ) : (
              <>
                Already have an account?{" "}
                <Link href="/login" className="text-blue-400 hover:underline">Sign in</Link>
              </>
            )}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
