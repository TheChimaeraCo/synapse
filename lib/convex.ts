import { ConvexHttpClient } from "convex/browser";

const CONVEX_URL = process.env.CONVEX_SELF_HOSTED_URL || "http://127.0.0.1:3220";

export function getConvexClient() {
  return new ConvexHttpClient(CONVEX_URL);
}

// Keep backward compat for existing API routes
export const convexClient = new ConvexHttpClient(CONVEX_URL);
