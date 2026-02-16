import { getConvexClient } from "@/lib/convex";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

export type AuditAction =
  | "user.login"
  | "config.change"
  | "agent.create"
  | "agent.update"
  | "agent.delete"
  | "channel.create"
  | "channel.delete"
  | "member.add"
  | "member.remove"
  | "member.role_change"
  | "tool.enable"
  | "tool.disable"
  | "gateway.create"
  | "gateway.update";

export type AuditResource =
  | "user"
  | "config"
  | "agent"
  | "channel"
  | "member"
  | "tool"
  | "gateway";

export async function logAudit(
  userId: string | undefined,
  action: AuditAction,
  resource: AuditResource,
  details?: string,
  resourceId?: string,
  ip?: string
) {
  try {
    const convex = getConvexClient();
    await convex.mutation(api.functions.auditLog.log, {
      userId: userId ? (userId as Id<"authUsers">) : undefined,
      action,
      resource,
      resourceId,
      details,
      ip,
    });
  } catch (e) {
    console.error("[auditLog] Failed to write audit log:", e);
  }
}
