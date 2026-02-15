import { GenericQueryCtx } from "convex/server";
import { DataModel } from "../_generated/dataModel";

const ROLE_HIERARCHY = { owner: 4, admin: 3, member: 2, viewer: 1 } as const;
type Role = keyof typeof ROLE_HIERARCHY;

export async function requireGatewayAccess(
  ctx: GenericQueryCtx<DataModel>,
  userId: any,
  gatewayId: any,
  minRole?: Role
) {
  const member = await ctx.db
    .query("gatewayMembers")
    .withIndex("by_gateway_user", (q: any) => q.eq("gatewayId", gatewayId).eq("userId", userId))
    .first();
  if (!member) throw new Error("Access denied: not a member of this gateway");
  if (minRole && ROLE_HIERARCHY[member.role as Role] < ROLE_HIERARCHY[minRole]) {
    throw new Error(`Access denied: requires ${minRole} role or higher`);
  }
  return member;
}

export async function getMasterGateway(ctx: GenericQueryCtx<DataModel>) {
  const all = await ctx.db.query("gateways").collect();
  return all.find((g: any) => g.isMaster === true) ?? null;
}

export async function isGatewayAdmin(
  ctx: GenericQueryCtx<DataModel>,
  userId: any,
  gatewayId: any
): Promise<boolean> {
  const member = await ctx.db
    .query("gatewayMembers")
    .withIndex("by_gateway_user", (q: any) => q.eq("gatewayId", gatewayId).eq("userId", userId))
    .first();
  if (!member) return false;
  return member.role === "owner" || member.role === "admin";
}
