import { ConvexHttpClient } from "convex/browser";

const CONVEX_URL = process.env.CONVEX_SELF_HOSTED_URL || "http://127.0.0.1:3220";

export function getConvexClient() {
  return new ConvexHttpClient(CONVEX_URL);
}

// Keep backward compat for existing API routes
export const convexClient = new ConvexHttpClient(CONVEX_URL);

/**
 * Execute a Convex operation with retry logic for transient failures.
 * Retries up to `maxRetries` times with exponential backoff.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  { maxRetries = 3, baseDelayMs = 500, label = "convex" } = {}
): Promise<T> {
  let lastError: Error | undefined;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      lastError = err;
      if (attempt < maxRetries) {
        const delay = baseDelayMs * Math.pow(2, attempt);
        console.warn(`[${label}] Attempt ${attempt + 1} failed, retrying in ${delay}ms:`, err.message);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }
  throw lastError;
}
