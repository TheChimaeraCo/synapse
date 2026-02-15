// Synapse - (c) The Chimaera Company LLC
// Licensed under the Functional Source License 1.0

import * as crypto from "crypto";
import type { LicensePayload, LicenseTier } from "./types";

const ALGORITHM = "RS256";

/**
 * Sign a license payload into a JWT token (admin/server-side only).
 * Requires the private key.
 */
export function signLicense(payload: Omit<LicensePayload, "iat">, privateKeyPem: string): string {
  const header = { alg: ALGORITHM, typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const fullPayload: LicensePayload = { ...payload, iat: now };

  const segments = [
    base64url(JSON.stringify(header)),
    base64url(JSON.stringify(fullPayload)),
  ];
  const signingInput = segments.join(".");
  const sign = crypto.createSign("RSA-SHA256");
  sign.update(signingInput);
  const signature = sign.sign(privateKeyPem, "base64url");
  return `${signingInput}.${signature}`;
}

/**
 * Decode a license JWT without verification (for reading claims).
 */
export function decodeLicense(token: string): LicensePayload | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString());
    return payload as LicensePayload;
  } catch {
    return null;
  }
}

/**
 * Generate a new license key for a given tier and licensee.
 * This is an admin utility - requires private key access.
 */
export function generateLicenseKey(opts: {
  licensee: string;
  tier: LicenseTier;
  maxUsers: number;
  maxGateways: number;
  features: string[];
  domain?: string;
  durationDays: number;
  privateKeyPem: string;
}): string {
  const now = Math.floor(Date.now() / 1000);
  return signLicense(
    {
      lid: crypto.randomUUID(),
      sub: opts.licensee,
      tier: opts.tier,
      maxUsers: opts.maxUsers,
      maxGateways: opts.maxGateways,
      features: opts.features,
      domain: opts.domain,
      exp: now + opts.durationDays * 86400,
    },
    opts.privateKeyPem,
  );
}

function base64url(str: string): string {
  return Buffer.from(str).toString("base64url");
}
