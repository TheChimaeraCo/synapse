// Synapse - (c) The Chimaera Company LLC
// Licensed under the Functional Source License 1.0

import { validateWithServer } from "./server";
import { getLicenseKey, getCurrentLicense, setCurrentLicense } from "./gates";
import { TIER_LIMITS } from "./types";

const VALIDATION_INTERVAL = 24 * 60 * 60 * 1000; // 24 hours
let validationTimer: ReturnType<typeof setInterval> | null = null;

/**
 * Initialize license validation on startup.
 * Non-blocking - runs in background.
 */
export function initLicenseValidation(): void {
  // Don't block startup
  setTimeout(() => runValidation(), 2000);
  // Periodic re-validation
  validationTimer = setInterval(() => runValidation(), VALIDATION_INTERVAL);
}

/**
 * Stop periodic validation (for cleanup).
 */
export function stopLicenseValidation(): void {
  if (validationTimer) {
    clearInterval(validationTimer);
    validationTimer = null;
  }
}

async function runValidation(): Promise<void> {
  try {
    const key = getLicenseKey();
    if (!key) {
      // No license key - free tier, nothing to validate
      setCurrentLicense({
        tier: "personal",
        limits: TIER_LIMITS.personal,
        payload: null,
        valid: true,
        cached: false,
        lastValidated: null,
      });
      return;
    }

    const state = await validateWithServer(key);
    setCurrentLicense(state);
  } catch {
    // Silent failure - keep current state
  }
}
