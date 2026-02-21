import { NextRequest, NextResponse } from "next/server";

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Static/asset routes - always skip
  if (
    pathname === "/manifest.json" ||
    pathname === "/sw.js" ||
    pathname.startsWith("/icon-")
  ) {
    return NextResponse.next();
  }

  // Check if setup is complete FIRST (before auth, before public routes)
  // This ensures login/register redirect to /setup when onboarding isn't done
  if (!pathname.startsWith("/setup") && !pathname.startsWith("/api/config") && !pathname.startsWith("/api/auth") && !pathname.startsWith("/api/setup")) {
    const setupComplete = req.cookies.get("synapse-setup-complete")?.value;
    if (!setupComplete && !pathname.startsWith("/api/")) {
      try {
        const internalBase = process.env.INTERNAL_URL || `http://127.0.0.1:${process.env.PORT || 3000}`;
        const setupRes = await fetch(new URL("/api/config/setup-complete", internalBase));
        const setupData = await setupRes.json();
        if (!setupData.complete) {
          return NextResponse.redirect(new URL("/setup", req.url));
        }
        // Set cookie so we don't check every request
        const res = NextResponse.next();
        res.cookies.set("synapse-setup-complete", "true", { path: "/", maxAge: 86400 });
        // Fall through to auth check below
      } catch {
        // If setup check fails, let it through
      }
    }
  }

  // Public routes - skip auth
  if (
    pathname.startsWith("/api/webhook") ||
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/api/invites") ||
    pathname.startsWith("/api/health") ||
    pathname.startsWith("/api/push/vapid") ||
    pathname.startsWith("/api/setup") ||
    pathname.startsWith("/api/channels/api-message") ||
    pathname.startsWith("/api/parse-pdf") ||
    // Config routes: setup-related endpoints are public (needed for setup wizard before gateway exists)
    // All other /api/config/* routes require session auth via normal flow
    pathname === "/api/config/setup-complete" ||
    pathname === "/api/config/test-anthropic" ||
    pathname === "/api/config/test-provider" ||
    pathname === "/api/config/test-telegram" ||
    pathname === "/api/config/exchange-token" ||
    pathname === "/api/config/register-webhook" ||
    pathname.startsWith("/login") ||
    pathname.startsWith("/register") ||
    pathname.startsWith("/setup") ||
    pathname.startsWith("/onboarding") ||
    pathname.startsWith("/invite")
  ) {
    return NextResponse.next();
  }

  // Check for session cookie
  const sessionToken = req.cookies.get("authjs.session-token")?.value
    || req.cookies.get("__Secure-authjs.session-token")?.value
    || req.cookies.get("next-auth.session-token")?.value
    || req.cookies.get("__Secure-next-auth.session-token")?.value;

  if (!sessionToken) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.redirect(new URL("/login", req.url));
  }

  // Routes that don't need gateway context
  const noGatewayRoutes = [
    "/api/gateways",
    "/api/auth",
    "/api/users",
    "/api/admin",
    "/gateways",
  ];
  if (noGatewayRoutes.some(r => pathname.startsWith(r))) {
    return NextResponse.next();
  }

  // For page routes (not API), let the client-side GatewayContext handle
  // gateway selection/redirection. Don't make middleware heavy with Convex queries.
  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
