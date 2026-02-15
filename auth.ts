import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { compare } from "bcryptjs";
import { ConvexHttpClient } from "convex/browser";
import { api } from "./convex/_generated/api";

const convex = new ConvexHttpClient(process.env.CONVEX_SELF_HOSTED_URL || "http://127.0.0.1:3220");

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        const email = (credentials.email as string).trim().toLowerCase();
        const password = credentials.password as string;

        console.log("[auth] Login attempt for:", email);

        const user = await convex.query(api.functions.users.getByEmail, { email });
        if (!user || !user.passwordHash) {
          console.log("[auth] User not found or no password hash. Found:", !!user);
          return null;
        }

        const valid = await compare(password, user.passwordHash);
        console.log("[auth] Password valid:", valid);
        if (!valid) return null;

        return {
          id: user._id,
          email: user.email,
          name: user.name || undefined,
          // TODO: Remove gatewayId/role from JWT once all code uses getGatewayContext() + gatewayMembers
          role: user.role,
          gatewayId: user.gatewayId,
        };
      },
    }),
  ],
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
    newUser: "/register",
  },
  callbacks: {
    async authorized({ request, auth }) {
      const { pathname } = request.nextUrl;
      // Public routes
      if (
        pathname.startsWith("/api/webhook") ||
        pathname.startsWith("/api/config") ||
        pathname.startsWith("/api/auth") ||
        pathname.startsWith("/api/invites") ||
        pathname.startsWith("/login") ||
        pathname.startsWith("/register") ||
        pathname.startsWith("/setup")
      ) {
        return true;
      }
      return !!auth;
    },
    async jwt({ token, user }) {
      if (user) {
        token.userId = user.id;
        token.email = user.email;
        token.name = user.name;
        // Keep for backward compatibility during transition
        token.role = (user as any).role;
        token.gatewayId = (user as any).gatewayId;
      }
      // Re-fetch userId in case of DB wipe (user ID format changed)
      if (token.userId && token.email) {
        try {
          const freshUser = await convex.query(api.functions.users.get, { id: token.userId as any });
          if (freshUser) {
            // Keep backward compat fields in sync
            token.gatewayId = freshUser.gatewayId;
            token.role = freshUser.role;
          } else {
            // User ID no longer exists (DB wipe?) - try to find by email
            const byEmail = await convex.query(api.functions.users.getByEmail, { email: (token.email as string).trim().toLowerCase() });
            if (byEmail) {
              token.userId = byEmail._id;
              token.gatewayId = byEmail.gatewayId;
              token.role = byEmail.role;
            }
          }
        } catch (e: any) {
          if (e.message?.includes("does not match") || e.message?.includes("not found")) {
            try {
              const byEmail = await convex.query(api.functions.users.getByEmail, { email: (token.email as string).trim().toLowerCase() });
              if (byEmail) {
                token.userId = byEmail._id;
                token.gatewayId = byEmail.gatewayId;
                token.role = byEmail.role;
              }
            } catch {}
          } else {
            console.warn("[auth] Failed to refresh user data:", e);
          }
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as any).userId = token.userId;
        // Keep for backward compatibility - gateway context now comes from getGatewayContext()
        (session.user as any).role = token.role;
        (session.user as any).gatewayId = token.gatewayId;
      }
      return session;
    },
  },
});
