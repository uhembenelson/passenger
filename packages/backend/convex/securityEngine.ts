import { verificationPolicy, type VerificationPolicy } from "./verificationPolicy";
import { calculateDistanceMeters } from "./geo";
import { compareClaimedToText, type NormalizedAddress } from "./address";

export type SecurityEngineDecision = "pass" | "review" | "high_risk";

export type SecurityEngineInput = {
  userId: string;
  claimedAddress: NormalizedAddress;
  claimedAddressGeo?: {
    latitude: number;
    longitude: number;
    confidence?: number;
    provider?: string;
  } | null;
  proofAddressText: string;
  identityDocumentAddressText?: string | null;
  liveLocation?: {
    latitude: number;
    longitude: number;
    accuracyMeters: number;
    capturedAt: number;
    sampleCount: number;
  } | null;
  deviceSignals?: {
    mockedLocation?: boolean;
    platform?: string;
    appVersion?: string;
  } | null;
  priorVerificationAttempts?: number;
};

export type SecurityAssessment = {
  version: "v1";
  score: number;
  decision: SecurityEngineDecision;
  signals: {
    geoMatch: {
      score: number;
      distanceMeters?: number;
      accuracyMeters?: number;
      status: "strong" | "acceptable" | "weak" | "mismatch" | "unavailable";
    };
    proofAddressMatch: {
      score: number;
      status: "strong" | "partial" | "mismatch";
      matchedComponents: string[];
      mismatchedComponents: string[];
    };
    identityAddressMatch?: {
      score: number;
      status: "strong" | "partial" | "mismatch" | "not_available";
    };
    deviceIntegrity: {
      score: number;
      flags: string[];
    };
  };
  flags: Array<{
    code: string;
    severity: "info" | "warning" | "high";
    message: string;
  }>;
};

type GeoStatus = SecurityAssessment["signals"]["geoMatch"]["status"];
const GEO_RANK: Record<GeoStatus, number> = {
  strong: 4,
  acceptable: 3,
  weak: 2,
  mismatch: 1,
  unavailable: 0,
};
const GEO_SCORES: Record<GeoStatus, number> = { strong: 50, acceptable: 35, weak: 15, mismatch: 0, unavailable: 0 };

function weaker(a: GeoStatus, b: GeoStatus | null): GeoStatus {
  if (!b) return a;
  return GEO_RANK[a] <= GEO_RANK[b] ? a : b;
}

function distanceStatus(distance: number, policy: VerificationPolicy): GeoStatus {
  const { geoStrongDistanceMeters, geoAcceptableDistanceMeters, geoReviewDistanceMeters } = policy;
  if (distance <= geoStrongDistanceMeters) return "strong";
  if (distance <= geoAcceptableDistanceMeters) return "acceptable";
  if (distance <= geoReviewDistanceMeters) return "weak";
  return "mismatch";
}

function accuracyStatus(accuracyMeters: number | undefined, policy: VerificationPolicy): GeoStatus | null {
  if (accuracyMeters === undefined) return null;
  const { accuracyStrongMeters, accuracyAcceptableMeters } = policy;
  if (accuracyMeters <= accuracyStrongMeters) return "strong";
  if (accuracyMeters <= accuracyAcceptableMeters) return "acceptable";
  return "weak";
}

export function runSecurityEngine(input: SecurityEngineInput, policy: VerificationPolicy = verificationPolicy): SecurityAssessment {
  const flags: SecurityAssessment["flags"] = [];
  const { securityWeights, securityPassThreshold, securityReviewThreshold } = policy;

  // geoMatch — live location vs geocoded claimed address (50 points).
  let geoMatch: SecurityAssessment["signals"]["geoMatch"];
  if (!input.claimedAddressGeo || !input.liveLocation) {
    geoMatch = {
      score: 0,
      accuracyMeters: input.liveLocation?.accuracyMeters,
      status: "unavailable",
    };
    flags.push({ code: "geo_unavailable", severity: "warning", message: "Live location or geocoded claimed address is unavailable." });
  } else {
    const distance = calculateDistanceMeters(
      { latitude: input.claimedAddressGeo.latitude, longitude: input.claimedAddressGeo.longitude },
      { latitude: input.liveLocation.latitude, longitude: input.liveLocation.longitude },
    );
    const status = weaker(
      distanceStatus(distance, policy),
      accuracyStatus(input.liveLocation.accuracyMeters, policy),
    );
    geoMatch = {
      score: GEO_SCORES[status] ?? 0,
      distanceMeters: Math.round(distance),
      accuracyMeters: input.liveLocation.accuracyMeters,
      status,
    };
    if (status === "mismatch") flags.push({ code: "geo_mismatch", severity: "high", message: "Live location is far from the claimed address." });
    else if (status === "weak") flags.push({ code: "geo_weak", severity: "warning", message: "Live location only weakly matches the claimed address." });
  }

  // proofAddressMatch — claimed vs typed proof-of-address (30 points).
  const proofMatch = compareClaimedToText(input.claimedAddress, input.proofAddressText);
  const proofScore = proofMatch.status === "strong" ? 30 : proofMatch.status === "partial" ? 15 : 0;
  if (proofMatch.status === "mismatch") flags.push({ code: "proof_mismatch", severity: "warning", message: "Proof address does not match the claimed address." });
  else if (proofMatch.status === "partial") flags.push({ code: "proof_partial", severity: "info", message: "Proof address partially matches the claimed address." });

  // identityAddressMatch — optional identity-document address (10 points).
  let identityAddressMatch: SecurityAssessment["signals"]["identityAddressMatch"];
  if (input.identityDocumentAddressText?.trim()) {
    const identityMatch = compareClaimedToText(input.claimedAddress, input.identityDocumentAddressText);
    const identityScore = identityMatch.status === "strong" ? 10 : identityMatch.status === "partial" ? 5 : 0;
    identityAddressMatch = { score: identityScore, status: identityMatch.status };
    if (identityMatch.status === "mismatch") flags.push({ code: "identity_mismatch", severity: "info", message: "Identity document address differs from the claimed address." });
  } else {
    identityAddressMatch = { score: 0, status: "not_available" };
  }

  // deviceIntegrity — mocked location and session signals (10 points).
  const integrityFlags: string[] = [];
  if (input.deviceSignals?.mockedLocation) {
    integrityFlags.push("mocked_location");
    flags.push({ code: "mocked_location", severity: "high", message: "A mocked location signal was reported by the client." });
  }
  if (input.priorVerificationAttempts && input.priorVerificationAttempts > 0) {
    flags.push({ code: "prior_attempts", severity: "info", message: `${input.priorVerificationAttempts} previous verification attempt(s) recorded.` });
  }
  const deviceIntegrity = { score: integrityFlags.includes("mocked_location") ? 0 : 10, flags: integrityFlags };

  const score =
    geoMatch.score +
    proofScore +
    (identityAddressMatch.score ?? 0) +
    deviceIntegrity.score;

  let decision: SecurityEngineDecision = score >= securityPassThreshold ? "pass" : score >= securityReviewThreshold ? "review" : "high_risk";

  // Geo unavailability must route to manual review, never auto-pass and never
  // auto-reject (plan §9). A mocked-location signal must never pass (plan §27).
  const geoUnavailable = geoMatch.status === "unavailable";
  const mockedLocation = integrityFlags.includes("mocked_location");
  if (mockedLocation && decision === "pass") decision = "review";
  if (geoUnavailable) decision = "review";

  const assessment: SecurityAssessment = {
    version: "v1",
    score,
    decision,
    signals: {
      geoMatch: {
        score: geoMatch.score,
        ...(geoMatch.distanceMeters !== undefined ? { distanceMeters: geoMatch.distanceMeters } : {}),
        ...(geoMatch.accuracyMeters !== undefined ? { accuracyMeters: geoMatch.accuracyMeters } : {}),
        status: geoMatch.status,
      },
      proofAddressMatch: {
        score: proofScore,
        status: proofMatch.status,
        matchedComponents: proofMatch.matchedComponents,
        mismatchedComponents: proofMatch.mismatchedComponents,
      },
      identityAddressMatch,
      deviceIntegrity,
    },
    flags,
  };

  // Normalize weights: if the sum of configured weights ever differs from 100,
  // scale the score back to 0–100 before computing the decision, then re-apply
  // the geo/mocked-location routing rules so they remain authoritative.
  const weightTotal = securityWeights.geoMatch + securityWeights.proofAddressMatch + securityWeights.identityAddressMatch + securityWeights.deviceIntegrity;
  if (weightTotal !== 100) {
    assessment.score = Math.round((score * 100) / weightTotal);
    decision = assessment.score >= securityPassThreshold ? "pass" : assessment.score >= securityReviewThreshold ? "review" : "high_risk";
    if (mockedLocation && decision === "pass") decision = "review";
    if (geoUnavailable) decision = "review";
    assessment.decision = decision;
  }

  return assessment;
}