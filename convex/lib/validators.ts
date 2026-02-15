import { QueryCtx, MutationCtx } from "../_generated/server";
import { Id } from "../_generated/dataModel";

export async function validateGatewayAccess(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"authUsers">,
  gatewayId: Id<"gateways">
): Promise<void> {
  const gateway = await ctx.db.get(gatewayId);
  if (!gateway) throw new Error("Gateway not found");
  if (gateway.ownerId !== userId) {
    // Check if user belongs to this gateway
    const user = await ctx.db.get(userId);
    if (!user || user.gatewayId !== gatewayId) {
      throw new Error("Access denied to gateway");
    }
  }
}
