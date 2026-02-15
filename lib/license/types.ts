// Synapse - (c) The Chimaera Company LLC
// Licensed under the Functional Source License 1.0

export type LicenseTier = "personal" | "team" | "business" | "enterprise";

export interface LicensePayload {
  /** Unique license ID */
  lid: string;
  /** Licensee name or email */
  sub: string;
  /** License tier */
  tier: LicenseTier;
  /** Max concurrent users */
  maxUsers: number;
  /** Max gateways */
  maxGateways: number;
  /** Enabled feature flags */
  features: string[];
  /** Domain restriction (optional) */
  domain?: string;
  /** Issued at (unix seconds) */
  iat: number;
  /** Expires at (unix seconds) */
  exp: number;
}

export interface TierLimits {
  maxUsers: number;
  maxGateways: number;
  features: string[];
  label: string;
  price: string;
}

export const TIER_LIMITS: Record<LicenseTier, TierLimits> = {
  personal: {
    maxUsers: 5,
    maxGateways: 1,
    features: ["chat", "tools", "knowledge", "sessions", "voice_basic"],
    label: "Personal",
    price: "Free",
  },
  team: {
    maxUsers: 15,
    maxGateways: 3,
    features: ["chat", "tools", "knowledge", "sessions", "voice_basic", "multi_channel", "custom_models", "automation"],
    label: "Team",
    price: "$29/mo",
  },
  business: {
    maxUsers: 50,
    maxGateways: 10,
    features: ["chat", "tools", "knowledge", "sessions", "voice_basic", "multi_channel", "custom_models", "automation", "advanced_analytics", "priority_support", "custom_branding", "api_access"],
    label: "Business",
    price: "$79/mo",
  },
  enterprise: {
    maxUsers: Infinity,
    maxGateways: Infinity,
    features: ["chat", "tools", "knowledge", "sessions", "voice_basic", "multi_channel", "custom_models", "automation", "advanced_analytics", "priority_support", "custom_branding", "api_access", "sso", "audit_log", "sla", "dedicated_support"],
    label: "Enterprise",
    price: "$199/mo",
  },
};

export interface LicenseState {
  tier: LicenseTier;
  limits: TierLimits;
  payload: LicensePayload | null;
  valid: boolean;
  cached: boolean;
  lastValidated: number | null;
}

export interface ValidationResponse {
  valid: boolean;
  tier: LicenseTier;
  payload: LicensePayload;
  serverTime: number;
}
