import { NextRequest, NextResponse } from "next/server";
import { getAuthContext, handleGatewayError } from "@/lib/gateway-context";

type OAuthSessionStatus =
  | "starting"
  | "waiting_for_auth"
  | "awaiting_input"
  | "completed"
  | "error"
  | "cancelled";

interface OAuthSession {
  id: string;
  provider: string;
  status: OAuthSessionStatus;
  createdAt: number;
  updatedAt: number;
  authUrl?: string;
  authInstructions?: string;
  lastPrompt?: string;
  progress: string[];
  error?: string;
  credentials?: Record<string, unknown>;
  manualInputs: string[];
  waiters: Array<(value: string) => void>;
}

const SESSION_TTL_MS = 30 * 60 * 1000;
const oauthSessions = new Map<string, OAuthSession>();

function now(): number {
  return Date.now();
}

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function clampProgress(progress: string[], max = 50): string[] {
  if (progress.length <= max) return progress;
  return progress.slice(progress.length - max);
}

function cleanupSessions(): void {
  const t = now();
  for (const [id, session] of oauthSessions.entries()) {
    if (t - session.createdAt > SESSION_TTL_MS) {
      for (const resolve of session.waiters) resolve("");
      oauthSessions.delete(id);
    }
  }
}

function takeSerializableSession(session: OAuthSession) {
  return {
    sessionId: session.id,
    provider: session.provider,
    status: session.status,
    authUrl: session.authUrl || null,
    authInstructions: session.authInstructions || null,
    lastPrompt: session.lastPrompt || null,
    progress: session.progress,
    error: session.error || null,
    credentials: session.credentials || null,
  };
}

function nextManualInput(session: OAuthSession): Promise<string> {
  if (session.manualInputs.length > 0) {
    return Promise.resolve(session.manualInputs.shift() || "");
  }
  return new Promise<string>((resolve) => {
    session.waiters.push(resolve);
  });
}

async function runOAuthLogin(session: OAuthSession): Promise<void> {
  try {
    const { getOAuthProvider } = await import("@mariozechner/pi-ai");
    const provider = getOAuthProvider(session.provider as any);
    if (!provider) {
      session.status = "error";
      session.error = `Unsupported OAuth provider: ${session.provider}`;
      session.updatedAt = now();
      return;
    }

    session.status = "waiting_for_auth";
    session.updatedAt = now();

    const credentials = await provider.login({
      onAuth: ({ url, instructions }) => {
        session.authUrl = url;
        session.authInstructions = instructions;
        session.status = "awaiting_input";
        session.updatedAt = now();
      },
      onPrompt: async (prompt) => {
        session.lastPrompt = prompt.message;
        session.status = "awaiting_input";
        session.updatedAt = now();
        return await nextManualInput(session);
      },
      onProgress: (message) => {
        session.progress = clampProgress([...session.progress, message]);
        session.updatedAt = now();
      },
      onManualCodeInput: async () => {
        session.status = "awaiting_input";
        session.updatedAt = now();
        return await nextManualInput(session);
      },
    });

    session.credentials = credentials as Record<string, unknown>;
    session.status = "completed";
    session.updatedAt = now();
  } catch (err: any) {
    if (session.status !== "cancelled") {
      session.status = "error";
      session.error = err?.message || "OAuth login failed";
      session.updatedAt = now();
    }
  }
}

export async function GET(req: NextRequest) {
  try {
    await getAuthContext();
    cleanupSessions();

    const sessionId = clean(req.nextUrl.searchParams.get("sessionId"));
    if (!sessionId) {
      return NextResponse.json({ error: "sessionId is required" }, { status: 400 });
    }

    const session = oauthSessions.get(sessionId);
    if (!session) {
      return NextResponse.json({ error: "OAuth session not found" }, { status: 404 });
    }

    return NextResponse.json(takeSerializableSession(session));
  } catch (err) {
    return handleGatewayError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    await getAuthContext();
    cleanupSessions();

    const body = await req.json();
    const action = clean(body?.action);

    if (action === "start") {
      const provider = clean(body?.provider);
      if (!provider) {
        return NextResponse.json({ error: "provider is required" }, { status: 400 });
      }

      const sessionId = crypto.randomUUID();
      const session: OAuthSession = {
        id: sessionId,
        provider,
        status: "starting",
        createdAt: now(),
        updatedAt: now(),
        progress: [],
        manualInputs: [],
        waiters: [],
      };
      oauthSessions.set(sessionId, session);
      void runOAuthLogin(session);

      // Give the login flow a brief chance to populate authUrl before returning.
      for (let i = 0; i < 20; i += 1) {
        if (session.authUrl || session.status === "error") break;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }

      return NextResponse.json(takeSerializableSession(session));
    }

    if (action === "submit") {
      const sessionId = clean(body?.sessionId);
      const input = clean(body?.input);
      if (!sessionId || !input) {
        return NextResponse.json({ error: "sessionId and input are required" }, { status: 400 });
      }
      const session = oauthSessions.get(sessionId);
      if (!session) {
        return NextResponse.json({ error: "OAuth session not found" }, { status: 404 });
      }
      if (session.status === "completed" || session.status === "error" || session.status === "cancelled") {
        return NextResponse.json(takeSerializableSession(session));
      }

      if (session.waiters.length > 0) {
        const waiter = session.waiters.shift();
        waiter?.(input);
      } else {
        session.manualInputs.push(input);
      }
      session.updatedAt = now();
      return NextResponse.json(takeSerializableSession(session));
    }

    if (action === "cancel") {
      const sessionId = clean(body?.sessionId);
      if (!sessionId) {
        return NextResponse.json({ error: "sessionId is required" }, { status: 400 });
      }
      const session = oauthSessions.get(sessionId);
      if (!session) {
        return NextResponse.json({ error: "OAuth session not found" }, { status: 404 });
      }
      session.status = "cancelled";
      session.updatedAt = now();
      for (const resolve of session.waiters) resolve("");
      session.waiters = [];
      return NextResponse.json(takeSerializableSession(session));
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    return handleGatewayError(err);
  }
}
