import { expect, it } from "vitest";
import { runSecurityEngine, type SecurityEngineInput } from "../convex/securityEngine";
import type { NormalizedAddress } from "../convex/address";

const claimed: NormalizedAddress = { houseNumberOrName: "14", street: "Yakubu Gowon Way", city: "Jos", state: "Plateau", country: "NG" };
const claimedGeo = { latitude: 9.8965, longitude: 8.8583 };
const nearLive = { latitude: 9.8966, longitude: 8.8584, accuracyMeters: 30, capturedAt: 100, sampleCount: 4 };
const farLive = { latitude: 6.5244, longitude: 3.3792, accuracyMeters: 30, capturedAt: 100, sampleCount: 4 };
const userId = "user-1";

function input(overrides: Partial<SecurityEngineInput> = {}): SecurityEngineInput {
  return {
    userId,
    claimedAddress: claimed,
    claimedAddressGeo: claimedGeo,
    proofAddressText: "14 Yakubu Gowon Way, Jos, Plateau",
    liveLocation: nearLive,
    deviceSignals: { mockedLocation: false },
    priorVerificationAttempts: 0,
    ...overrides,
  };
}

it("gives a pass band for a strong geolocation match", () => {
  const assessment = runSecurityEngine(input());
  expect(assessment.signals.geoMatch.status).toBe("strong");
  expect(assessment.signals.proofAddressMatch.status).toBe("strong");
  expect(assessment.signals.deviceIntegrity.score).toBe(10);
  expect(assessment.score).toBeGreaterThanOrEqual(80);
  expect(assessment.decision).toBe("pass");
});

it("gives a review band for an acceptable-but-not-exact match", () => {
  const assessment = runSecurityEngine(
    input({
      claimedAddressGeo: { latitude: 9.8965, longitude: 8.8583 },
      liveLocation: { latitude: 9.8978, longitude: 8.8596, accuracyMeters: 30, capturedAt: 100, sampleCount: 4 },
    }),
  );
  expect(assessment.signals.geoMatch.status).toBe("acceptable");
  expect(assessment.decision).toBe("review");
});

it("gives a high-risk band for a large location mismatch", () => {
  const assessment = runSecurityEngine(input({ liveLocation: farLive }));
  expect(assessment.signals.geoMatch.status).toBe("mismatch");
  expect(assessment.signals.geoMatch.distanceMeters!).toBeGreaterThan(500);
  expect(assessment.score).toBeLessThan(55);
  expect(assessment.decision).toBe("high_risk");
  expect(assessment.flags.some(flag => flag.code === "geo_mismatch")).toBe(true);
});

it("routes geocoder unavailability to review without rejecting", () => {
  const assessment = runSecurityEngine(input({ claimedAddressGeo: null }));
  expect(assessment.signals.geoMatch.status).toBe("unavailable");
  expect(assessment.signals.geoMatch.score).toBe(0);
  expect(assessment.decision).toBe("review");
});

it("treats a missing identity-document address as not_available without penalty beyond the signal", () => {
  const assessment = runSecurityEngine(input({ identityDocumentAddressText: undefined }));
  expect(assessment.signals.identityAddressMatch?.status).toBe("not_available");
  expect(assessment.signals.identityAddressMatch?.score).toBe(0);
});

it("rewards an identity-document address that matches the claimed address", () => {
  const assessment = runSecurityEngine(input({ identityDocumentAddressText: "14 Yakubu Gowon Way, Jos, Plateau" }));
  expect(assessment.signals.identityAddressMatch?.status).toBe("strong");
  expect(assessment.score).toBe(100);
  expect(assessment.decision).toBe("pass");
});

it("penalizes poor GPS accuracy", () => {
  const assessment = runSecurityEngine(
    input({ liveLocation: { latitude: 9.8966, longitude: 8.8584, accuracyMeters: 180, capturedAt: 100, sampleCount: 4 } }),
  );
  expect(assessment.signals.geoMatch.status).toBe("weak");
  expect(assessment.decision).toBe("review");
});

it("zeroes device integrity and flags a mocked location", () => {
  const assessment = runSecurityEngine(input({ deviceSignals: { mockedLocation: true } }));
  expect(assessment.signals.deviceIntegrity.score).toBe(0);
  expect(assessment.signals.deviceIntegrity.flags).toContain("mocked_location");
  expect(assessment.flags.some(flag => flag.code === "mocked_location" && flag.severity === "high")).toBe(true);
  expect(assessment.decision).toBe("review");
});

it("treats a partial proof match as partial", () => {
  const assessment = runSecurityEngine(input({ proofAddressText: "16 Yakubu Gowon Way, Jos, Plateau" }));
  expect(assessment.signals.proofAddressMatch.status).toBe("partial");
  expect(assessment.signals.proofAddressMatch.score).toBe(15);
  expect(assessment.signals.proofAddressMatch.mismatchedComponents).toContain("house");
  expect(assessment.decision).toBe("review");
});

it("treats a mismatched proof as mismatch", () => {
  const assessment = runSecurityEngine(input({ proofAddressText: "12 Ahmadu Bello Way, Ikeja, Lagos" }));
  expect(assessment.signals.proofAddressMatch.status).toBe("mismatch");
  expect(assessment.signals.proofAddressMatch.score).toBe(0);
});

it("records prior verification attempts as an informational flag", () => {
  const assessment = runSecurityEngine(input({ priorVerificationAttempts: 4 }));
  expect(assessment.flags.some(flag => flag.code === "prior_attempts" && flag.severity === "info")).toBe(true);
});