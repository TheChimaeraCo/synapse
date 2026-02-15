// Synapse - (c) The Chimaera Company LLC
// Licensed under the Functional Source License 1.0

import * as crypto from "crypto";
import type { LicensePayload } from "./types";

// Public key baked in for verification
const PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAz6zQtcFRcW2AnVY3DBPd
w7exELWTuRZmD/I62wQ4gXfWZabWUAzW3X3jloXFojm3eqTUaDunCmEjzQPwBxfc
FMiFj4bPY0FGZZ2bCOZIkZwbO83TgfITKm4ukmvN+4gLUgfEisTJ9HjsY7ePRlBu
+JPBvfRxmK1JfufBaiI+4dTYK1GyL5jx9cKb8774Lqp+lnM2xjt1hDQkmnSZb3IP
BbDyqL+JC0D9KsjNnl6Dx87pW8+/NaK8p+G8xOeTgt+HnxQBWd/qJ3e6PT3R7KQc
5LXMwg9SqN76A8Fvmm6W4AEmVraG+Y6+u8ZMd6aPMtUB7AXXotDu/C/ifvL6wsQf
IQIDAQAB
-----END PUBLIC KEY-----`;

/**
 * Verify a license JWT signature and expiration.
 * Returns the decoded payload if valid, null otherwise.
 */
export function verifyLicense(token: string): LicensePayload | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;

    const signingInput = `${parts[0]}.${parts[1]}`;
    const signature = parts[2];

    const verifier = crypto.createVerify("RSA-SHA256");
    verifier.update(signingInput);
    const valid = verifier.verify(PUBLIC_KEY, signature, "base64url");
    if (!valid) return null;

    const payload: LicensePayload = JSON.parse(
      Buffer.from(parts[1], "base64url").toString(),
    );

    // Check expiration
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < now) return null;

    return payload;
  } catch {
    return null;
  }
}

/**
 * Quick check if a token has a valid structure (without full crypto verify).
 * Used for fast pre-filtering.
 */
export function isLicenseToken(token: string): boolean {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return false;
    const header = JSON.parse(Buffer.from(parts[0], "base64url").toString());
    return header.alg === "RS256" && header.typ === "JWT";
  } catch {
    return false;
  }
}
