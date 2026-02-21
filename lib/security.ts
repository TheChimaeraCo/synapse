import { createHash, timingSafeEqual } from "crypto";

/**
 * Constant-time secret comparison to avoid leaking equality timing.
 */
export function safeEqualSecret(
  provided: string | null | undefined,
  expected: string | null | undefined,
): boolean {
  if (typeof provided !== "string" || typeof expected !== "string") {
    return false;
  }
  const hash = (s: string) => createHash("sha256").update(s).digest();
  return timingSafeEqual(hash(provided), hash(expected));
}

export function extractBearerToken(authorizationHeader: string | null | undefined): string | null {
  if (!authorizationHeader) return null;
  const match = authorizationHeader.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}
