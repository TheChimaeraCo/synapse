// Synapse - (c) The Chimaera Company LLC
// Licensed under the Functional Source License 1.0

import { TIER_LIMITS, type LicenseState, type LicenseTier, type TierLimits } from "./types";
import { verifyLicense } from "./verify";

// In-memory license state - initialized to free tier
let _currentLicense: LicenseState = {
  tier: "personal",
  limits: TIER_LIMITS.personal,
  payload: null,
  valid: true,
  cached: false,
  lastValidated: null,
};

// License key from environment
const LICENSE_KEY = process.env.SYNAPSE_LICENSE_KEY || process.env.LICENSE_KEY || "";

export function getLicenseKey(): string {
  return LICENSE_KEY;
}

export function getCurrentLicense(): LicenseState {
  return _currentLicense;
}

export function setCurrentLicense(state: LicenseState): void {
  _currentLicense = state;
}

/**
 * Quick tier check - use this everywhere.
 */
export function getCurrentTier(): LicenseTier {
  return _currentLicense.tier;
}

/**
 * Get current limits based on active license.
 */
export function getLimits(): TierLimits {
  return _currentLicense.limits;
}

/**
 * Check if a specific feature is available in the current tier.
 * Lightweight - safe to call frequently.
 */
export function checkFeature(feature: string): boolean {
  return _currentLicense.limits.features.includes(feature);
}

/**
 * Check if the current tier allows adding more users.
 */
export function canAddUser(currentCount: number): boolean {
  const max = _currentLicense.limits.maxUsers;
  return max === Infinity || currentCount < max;
}

/**
 * Check if the current tier allows creating more gateways.
 */
export function canCreateGateway(currentCount: number): boolean {
  const max = _currentLicense.limits.maxGateways;
  return max === Infinity || currentCount < max;
}

/**
 * Get the next tier that would unlock a feature or higher limit.
 */
export function getUpgradeTier(feature?: string): { tier: LicenseTier; limits: TierLimits } | null {
  const tiers: LicenseTier[] = ["personal", "team", "business", "enterprise"];
  const currentIdx = tiers.indexOf(_currentLicense.tier);
  if (currentIdx >= tiers.length - 1) return null;

  if (feature) {
    for (let i = currentIdx + 1; i < tiers.length; i++) {
      if (TIER_LIMITS[tiers[i]].features.includes(feature)) {
        return { tier: tiers[i], limits: TIER_LIMITS[tiers[i]] };
      }
    }
  }

  const next = tiers[currentIdx + 1];
  return { tier: next, limits: TIER_LIMITS[next] };
}

/**
 * Format a user-friendly upgrade message.
 */
export function upgradeMessage(reason: string): string {
  const next = getUpgradeTier();
  if (!next) return reason;
  return `${reason} Upgrade to ${next.limits.label} (${next.limits.price}) to unlock this.`;
}

// Initialize from env on module load (non-blocking)
if (LICENSE_KEY) {
  const payload = verifyLicense(LICENSE_KEY);
  if (payload) {
    _currentLicense = {
      tier: payload.tier,
      limits: TIER_LIMITS[payload.tier],
      payload,
      valid: true,
      cached: false,
      lastValidated: null,
    };
  }
}
