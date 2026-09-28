// Central verification policy. Single source of truth for every tunable value
// in the verification & security engine. Do not scatter these constants through
// the codebase (plan §39). Initial values are starting points, not permanent
// truth — tune them from real Nigerian usage data.

export const verificationPolicy = {
  // Short-lived live address-verification sessions.
  addressSessionDurationMs: 5 * 60 * 1000,

  // Max number of failed submission attempts within one session before it is
  // invalidated and the user must start a fresh session (plan §27).
  addressSessionMaxAttempts: 3,

  // Reject samples whose capture time deviates from the server receive time by
  // more than this (treat server receive time as authoritative; plan §12).
  locationSampleMaxAgeMs: 5 * 60 * 1000,

  // Minimum usable GPS readings required to accept a live location.
  minimumLocationSamples: 3,

  // Reject samples/derived coordinates with accuracy above this (plan §12).
  maxAcceptedLocationAccuracyMeters: 200,

  // Distance bands between live location and geocoded claimed address (plan §13).
  geoStrongDistanceMeters: 100,
  geoAcceptableDistanceMeters: 250,
  geoReviewDistanceMeters: 500,

  // GPS accuracy guidance (plan §12).
  accuracyStrongMeters: 50,
  accuracyAcceptableMeters: 100,

  // Security Engine score bands (plan §14). pass does NOT auto-approve;
  // low score does NOT auto-reject. Admin remains the final decision-maker.
  securityPassThreshold: 80,
  securityReviewThreshold: 55,

  // MVP weightings (plan §14), as configurable constants.
  securityWeights: {
    geoMatch: 50,
    proofAddressMatch: 30,
    identityAddressMatch: 10,
    deviceIntegrity: 10,
  },

  // Conservative Tier 1 defaults until business owners approve final values
  // (plan §20 kycTiers). Not the accidental 100kg / ₦500k legacy default.
  tier1DefaultLimits: {
    maxCapacityKg: 10,
    maxShipmentValueNaira: 100_000,
  },

  // Abuse control (plan §27): max live address-verification attempts per day.
  maxAddressVerificationAttemptsPerDay: 3,
} as const;

export type VerificationPolicy = typeof verificationPolicy;