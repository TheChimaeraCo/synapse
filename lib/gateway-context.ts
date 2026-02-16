import { auth } from "@/auth";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

const convex = new ConvexHttpClient(process.env.CONVEX_SELF_HOSTED_URL || "http://127.0.0.1:3220");

function getCookieValue(req: Request, name: string): string | null {
  const cookie = req.headers.get("cookie");
  if (!cookie) return null;
  const match = cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

export type GatewayRole = "owner" | "admin" | "member" | "viewer";

export interface GatewayContext {
  userId: string;
  gatewayId: string;
  role: GatewayRole;
}

export interface AuthContext {
  userId: string;
}

/** HTTP-aware error for gateway auth failures. Caught by handleGatewayError(). */
export class GatewayError extends Error {
  constructor(public statusCode: number, message: string) {
    super(message);
  }
}

/**
 * Get gateway context from request. Resolves gateway from header, query param, or cookie.
 * Verifies the user has access to the gateway via gatewayMembers.
 * 
 * Falls back to session.gatewayId for backward compatibility during transition.
 */
export async function getGatewayContext(req: Request): Promise<GatewayContext> {
  // NOTE: X-API-Channel-Auth bypass was removed for security.
  // The api-message route handles its own auth via Bearer token + channel API key.
  // No other route should bypass session auth.

  const session = await auth();
  if (!session?.user) throw new GatewayError(401, "Not authenticated");

  const userId = (session.user as any).userId;
  if (!userId) throw new GatewayError(401, "Not authenticated");

  // Gateway ID from header, query param, cookie, or session (backward compat)
  const gatewayId = req.headers.get("X-Gateway-Id")
    || new URL(req.url).searchParams.get("gatewayId")
    || getCookieValue(req, "synapse-active-gateway")
    || getCookieValue(req, "synapse-gateway")
    || (session.user as any).gatewayId;

  if (!gatewayId) throw new GatewayError(400, "No gateway selected");

  // Verify access via gatewayMembers
  try {
    const role = await convex.query(api.functions.gatewayMembers.getRole, {
      gatewayId: gatewayId as Id<"gateways">,
      userId: userId as Id<"authUsers">,
    });

    if (role) {
      return { userId, gatewayId, role: role as GatewayRole };
    }
  } catch {
    // If gatewayMembers lookup fails (e.g. pre-migration), fall through to legacy check
  }

  // TODO: Remove legacy fallback once all users have gatewayMembers entries (post-migration)
  const sessionGatewayId = (session.user as any).gatewayId;
  const sessionRole = (session.user as any).role;
  if (sessionGatewayId && sessionGatewayId === gatewayId && sessionRole) {
    return { userId, gatewayId, role: sessionRole as GatewayRole };
  }

  throw new GatewayError(403, "No access to this gateway");
}

/**
 * For routes that only need auth, not gateway context.
 */
export async function getAuthContext(): Promise<AuthContext> {
  const session = await auth();
  if (!session?.user) throw new GatewayError(401, "Not authenticated");
  const userId = (session.user as any).userId;
  if (!userId) throw new GatewayError(401, "Not authenticated");
  return { userId };
}

/**
 * Helper to catch GatewayError and return appropriate HTTP responses.
 */
export function handleGatewayError(err: unknown): Response {
  if (err instanceof GatewayError) {
    return Response.json({ error: err.message }, { status: err.statusCode });
  }
  console.error("Unexpected error:", err);
  // Don't leak internal error details to clients
  return Response.json(
    { error: "Internal server error" },
    { status: 500 }
  );
}
