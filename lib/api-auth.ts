import { auth } from "@/auth";
import { NextResponse } from "next/server";

/**
 * @deprecated Use getGatewayContext() from lib/gateway-context.ts for gateway-scoped routes.
 * Kept for backward compatibility during transition.
 */
export async function getAuthSession() {
  const session = await auth();
  if (!session?.user) return null;
  return {
    userId: (session.user as any).userId,
    gatewayId: (session.user as any).gatewayId,
    role: (session.user as any).role,
  };
}

export function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}
