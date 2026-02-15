// Synapse - (c) The Chimaera Company LLC
// Licensed under the Functional Source License 1.0

export { checkFeature, canAddUser, canCreateGateway, getCurrentTier, getLimits, upgradeMessage, getCurrentLicense } from "./gates";
export { TIER_LIMITS, type LicenseTier, type LicenseState, type TierLimits } from "./types";
export { initLicenseValidation, stopLicenseValidation } from "./phoneHome";
