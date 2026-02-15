import { NextRequest, NextResponse } from "next/server";

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Public routes - skip auth
  if (
    pathname.startsWith("/api/webhook") ||
    pathname.startsWith("/api/config") ||
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/api/invites") ||
    pathname.startsWith("/api/health") ||
    pathname.startsWith("/api/push/vapid") ||
    pathname.startsWith("/api/setup") ||
    pathname.startsWith("/login") ||
    pathname.startsWith("/register") ||
    pathname.startsWith("/setup") ||
    pathname.startsWith("/onboarding") ||
    pathname.startsWith("/invite") ||
    pathname === "/manifest.json" ||
    pathname === "/sw.js" ||
    pathname.startsWith("/icon-")
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
