// Synapse - (c) The Chimaera Company LLC
// Licensed under the Functional Source License 1.0

import { verifyLicense } from "./verify";
import { TIER_LIMITS, type LicensePayload, type LicenseState, type LicenseTier, type ValidationResponse } from "./types";
import * as fs from "fs";
import * as path from "path";

const LICENSE_SERVER = "https://license.chimaeraco.dev/api/validate";
const GRACE_PERIOD_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const CACHE_FILE = path.join(process.cwd(), ".license-cache.json");

interface CachedValidation {
  payload: LicensePayload;
  validatedAt: number;
  serverResponse: ValidationResponse;
}

function readCache(): CachedValidation | null {
  try {
    if (fs.existsSync(CACHE_FILE)) {
      return JSON.parse(fs.readFileSync(CACHE_FILE, "utf-8"));
    }
  } catch { /* silent */ }
  return null;
}

function writeCache(data: CachedValidation): void {
  try {
    fs.writeFileSync(CACHE_FILE, JSON.stringify(data), "utf-8");
  } catch { /* silent */ }
}

/**
 * Validate license with the remote server.
 * Falls back to cache if server is unreachable (7-day grace).
 */
export async function validateWithServer(token: string): Promise<LicenseState> {
  // First verify locally
  const payload = verifyLicense(token);
  if (!payload) {
    return freeTierState();
  }

  // Try remote validation
  try {
    const res = await fetch(LICENSE_SERVER, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, lid: payload.lid }),
      signal: AbortSignal.timeout(5000),
    });

    if (res.ok) {
      const data: ValidationResponse = await res.json();
      if (data.valid) {
        const cached: CachedValidation = {
          payload: data.payload,
          validatedAt: Date.now(),
          serverResponse: data,
        };
        writeCache(cached);
        return {
          tier: data.tier,
          limits: TIER_LIMITS[data.tier],
          payload: data.payload,
          valid: true,
          cached: false,
          lastValidated: Date.now(),
        };
      }
    }
  } catch {
    // Server unreachable - check cache
    const cached = readCache();
    if (cached && cached.payload.lid === payload.lid) {
      const age = Date.now() - cached.validatedAt;
      if (age < GRACE_PERIOD_MS) {
        return {
          tier: cached.payload.tier,
          limits: TIER_LIMITS[cached.payload.tier],
          payload: cached.payload,
          valid: true,
          cached: true,
          lastValidated: cached.validatedAt,
        };
      }
    }
  }

  // Local-only validation (no server confirmation, but signature is valid)
  return {
    tier: payload.tier,
    limits: TIER_LIMITS[payload.tier],
    payload,
    valid: true,
    cached: false,
    lastValidated: null,
  };
}

function freeTierState(): LicenseState {
  return {
    tier: "personal",
    limits: TIER_LIMITS.personal,
    payload: null,
    valid: true,
    cached: false,
    lastValidated: null,
  };
}
