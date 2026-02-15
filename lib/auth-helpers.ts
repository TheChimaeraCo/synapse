import { auth } from "@/auth";
import { NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";

const convex = new ConvexHttpClient(process.env.CONVEX_SELF_HOSTED_URL || "http://127.0.0.1:3220");

const PERMISSIONS: Record<string, string[]> = {
  "settings.read": ["owner", "admin"],
  "settings.write": ["owner", "admin"],
  "agents.read": ["owner", "admin", "user", "viewer"],
  "agents.write": ["owner", "admin"],
  "channels.read": ["owner", "admin", "user", "viewer"],
  "channels.write": ["owner", "admin"],
  "tools.read": ["owner", "admin", "user", "viewer"],
  "tools.write": ["owner", "admin"],
  "chat.read": ["owner", "admin", "user", "viewer"],
  "chat.write": ["owner", "admin", "user"],
  "dashboard.read": ["owner", "admin", "user", "viewer"],
  "users.read": ["owner", "admin"],
  "users.manage": ["owner", "admin"],
  "roles.assign": ["owner", "admin"],
  "audit.read": ["owner", "admin"],
  "knowledge.read": ["owner", "admin", "user", "viewer"],
  "knowledge.write": ["owner", "admin", "user"],
};

export async function getSession() {
  return await auth();
}

export function hasPermission(role: string, permission: string): boolean {
  const allowed = PERMISSIONS[permission];
  if (!allowed) return false;
  return allowed.includes(role);
}

export async function requirePermission(permission: string) {
  const session = await auth();
  if (!session?.user) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }), session: null };
  }
  const role = (session.user as any).role as string;
  if (!hasPermission(role, permission)) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }), session: null };
  }
  return { error: null, session };
}

export async function requireAuth() {
  const session = await auth();
  if (!session?.user) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }), session: null };
  }
  return { error: null, session };
}

export async function logAudit(
  session: any,
  action: string,
  resource: string,
  resourceId?: string,
  details?: string,
  ip?: string
) {
  try {
    const userId = (session?.user as any)?.userId;
    await convex.mutation(api.functions.auditLog.log, {
      userId: userId || undefined,
      action,
      resource,
      resourceId,
      details,
      ip,
    });
  } catch (e) {
    console.error("Failed to write audit log:", e);
  }
}
