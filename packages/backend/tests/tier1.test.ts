import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "../convex/schema";
import { api } from "../convex/_generated/api";
import { verificationPolicy } from "../convex/verificationPolicy";
import type { Id } from "../convex/_generated/dataModel";
const modules = import.meta.glob("../convex/**/*.ts");
const identity = (subject: string) => ({ subject, email: `${subject}@example.com`, issuer: "https://clerk.test", tokenIdentifier: `https://clerk.test|${subject}` });
beforeEach(() => {
  vi.stubEnv("TERMII_API_KEY", "test-key");
  vi.stubEnv("TERMII_SENDER_ID", "Passenger");
  vi.stubEnv("TERMII_CHANNEL", "dnd");
  vi.stubEnv("TERMII_BASE_URL", "https://api.ng.termii.com");
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ code: "ok", message_id: "msg-123" }))));
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
async function setup() {
  const t = convexTest(schema, modules);
  const member = t.withIdentity(identity("tier1"));
  const stranger = t.withIdentity(identity("stranger"));
  const strangerProfile = await stranger.mutation(api.accounts.ensureProfile, { name: "Stranger", phone: "+2348000000003" });
  const profile = await member.mutation(api.accounts.ensureProfile, { name: "Tier One", phone: "+2348000000002" });
  const userId = profile.id as Id<"users">;
  await t.run(ctx => ctx.db.patch(userId, { kycTier: 0, identityNumberVerificationType: "BVN", identityNumberVerifiedAt: Date.now(), identityNumberLast4: "0002" }));
  return { t, member, stranger, userId, strangerId: strangerProfile.id as Id<"users"> };
}
async function addEvidence(t: ReturnType<typeof convexTest>, userId: Id<"users">, purpose: "identity" | "proof_of_address", fileName = "evidence.png") {
  const storageId = await t.run(ctx => ctx.storage.store(new Blob([new Uint8Array([1, 2, 3, 4])], { type: "image/png" })) as Promise<Id<"_storage">>);
  return t.run(ctx => ctx.db.insert("evidence", {
    ownerId: userId,
    storageId,
    purpose,
    filename: fileName,
    contentType: "image/png",
    size: 4,
    createdAt: Date.now(),
  }));
}
const claimedAddress = { street: "12 Test Crescent", city: "Ikeja", state: "Lagos", country: "NG" as const, houseNumberOrName: "12", postalCode: "100271" };

async function completeLiveVerification(t: ReturnType<typeof convexTest>, member: Awaited<ReturnType<typeof setup>>["member"], userId: Id<"users">) {
  const proofEvidenceId = await addEvidence(t, userId, "proof_of_address");
  await member.mutation(api.tier1.saveTier1ProofOfAddress, {
    proofOfAddressType: "utility_bill",
    proofAddressText: "12 Test Crescent, Ikeja, Lagos",
    proofAddressEvidenceIds: [proofEvidenceId],
  });
  const started = await member.mutation(api.tier1.startAddressVerification, {});
  const now = Date.now();
  const samples = [
    { latitude: 6.5244, longitude: 3.3792, accuracyMeters: 30, clientCapturedAt: now - 1000 },
    { latitude: 6.5245, longitude: 3.3791, accuracyMeters: 40, clientCapturedAt: now - 2000 },
    { latitude: 6.5243, longitude: 3.3793, accuracyMeters: 50, clientCapturedAt: now - 3000 },
  ];
  await member.mutation(api.tier1.submitAddressVerification, {
    sessionId: started.sessionId,
    token: started.token,
    samples,
    deviceSignals: { mockedLocation: false, platform: "ios", appVersion: "1.2.3" },
  });
  await member.mutation(api.tier1.runSecurityAssessment, {});
}

it("blocks drafts until BVN or NIN is verified", async () => {
  const { t, member, userId } = await setup();
  await t.run(ctx => ctx.db.patch(userId, { kycTier: undefined, identityNumberVerificationType: undefined, identityNumberVerifiedAt: undefined }));
  await expect(member.mutation(api.tier1.saveTier1IdentityDraft, {
    legalName: { firstName: "Tier", lastName: "One" },
    identityDocumentType: "national_id",
    identityEvidenceIds: [],
  })).rejects.toThrow("Verify with BVN or NIN");
});

it("creates and reuses the same identity draft version", async () => {
  const { t, member, userId } = await setup();
  const evidence = await addEvidence(t, userId, "identity");
  const first = await member.mutation(api.tier1.saveTier1IdentityDraft, {
    legalName: { firstName: "Tier", middleName: "A", lastName: "One" },
    identityDocumentType: "national_id",
    identityDocumentNumber: "N123456",
    identityEvidenceIds: [evidence],
  });
  expect(first).toMatchObject({ version: 1, status: "draft" });
  const second = await member.mutation(api.tier1.saveTier1IdentityDraft, {
    legalName: { firstName: "Tier", lastName: "One" },
    identityDocumentType: "passport",
    identityEvidenceIds: [evidence],
  });
  expect(second.submissionId).toBe(first.submissionId);
  expect(second.version).toBe(1);
  const active = await member.query(api.tier1.getMyActiveTier1Submission, {});
  expect(active).toMatchObject({ version: 1, identityDocumentType: "passport", legalName: { firstName: "Tier", lastName: "One" } });
});

it("saves the claimed address and proof-of-address onto the draft", async () => {
  const { t, member, userId } = await setup();
  const proofEvidenceId = await addEvidence(t, userId, "proof_of_address");
  await member.mutation(api.tier1.saveTier1AddressDraft, {
    claimedAddress,
    claimedAddressRaw: "12 Test Crescent, Ikeja, Lagos, Nigeria",
  });
  const saved = await member.mutation(api.tier1.saveTier1ProofOfAddress, {
    proofOfAddressType: "utility_bill",
    proofAddressText: "12 Test Crescent, Ikeja, Lagos",
    proofAddressEvidenceIds: [proofEvidenceId],
  });
  const draft = await member.query(api.tier1.getMyActiveTier1Submission, {});
  expect(draft).toMatchObject({ claimedAddress, claimedAddressRaw: "12 Test Crescent, Ikeja, Lagos, Nigeria", proofOfAddressType: "utility_bill", proofAddressSource: "user_entered", proofAddressEvidenceIds: [proofEvidenceId] });
  expect(draft).not.toHaveProperty("geocodedAddress");
  expect(draft).not.toHaveProperty("liveAddressResult");
  expect(draft).not.toHaveProperty("securityAssessment");
  expect(saved).toMatchObject({ version: 1, status: "draft" });
});

it("rejects evidence not owned by the member or for the wrong purpose", async () => {
  const { t, member, strangerId, userId } = await setup();
  const ownIdentity = await addEvidence(t, userId, "identity");
  const storageId = await t.run(ctx => ctx.storage.store(new Blob([new Uint8Array([9])], { type: "image/png" })) as Promise<Id<"_storage">>);
  const strangerEvidenceId = await t.run(ctx => ctx.db.insert("evidence", {
    ownerId: strangerId,
    storageId,
    purpose: "identity",
    filename: "stranger.png",
    contentType: "image/png",
    size: 1,
    createdAt: Date.now(),
  }));
  await expect(member.mutation(api.tier1.saveTier1IdentityDraft, {
    legalName: { firstName: "Tier", lastName: "One" },
    identityDocumentType: "national_id",
    identityEvidenceIds: [strangerEvidenceId],
  })).rejects.toThrow("your own upload");
  await expect(member.mutation(api.tier1.saveTier1ProofOfAddress, {
    proofOfAddressType: "utility_bill",
    proofAddressText: "12 Test Crescent, Ikeja, Lagos",
    proofAddressEvidenceIds: [ownIdentity],
  })).rejects.toThrow("your own upload");
});

it("rejects validations for names, addresses and proof text", async () => {
  const { t, member, userId } = await setup();
  const evidence = await addEvidence(t, userId, "identity");
  await expect(member.mutation(api.tier1.saveTier1IdentityDraft, {
    legalName: { firstName: "", lastName: "One" },
    identityDocumentType: "national_id",
    identityEvidenceIds: [evidence],
  })).rejects.toThrow("first name");
  await expect(member.mutation(api.tier1.saveTier1AddressDraft, {
    claimedAddress: { street: "", city: "Ikeja", state: "Lagos", country: "NG" },
    claimedAddressRaw: "12 Test Crescent, Ikeja, Lagos, Nigeria",
  })).rejects.toThrow("complete street");
  await expect(member.mutation(api.tier1.saveTier1AddressDraft, {
    claimedAddress,
    claimedAddressRaw: "Ikeja",
  })).rejects.toThrow("12–300");
  await expect(member.mutation(api.tier1.saveTier1ProofOfAddress, {
    proofOfAddressType: "",
    proofAddressText: "12 Test Crescent, Ikeja, Lagos",
    proofAddressEvidenceIds: [],
  })).rejects.toThrow("proof-of-address type");
});

it("submits only a complete application and marks it pending while staying Tier 0", async () => {
  const { t, member, userId } = await setup();
  await expect(member.mutation(api.tier1.submitTier1Verification, {})).rejects.toThrow("Complete your Tier 1 application");
  const identityEvidenceId = await addEvidence(t, userId, "identity");
  const proofEvidenceId = await addEvidence(t, userId, "proof_of_address");
  await member.mutation(api.tier1.saveTier1IdentityDraft, {
    legalName: { firstName: "Tier", lastName: "One" },
    identityDocumentType: "national_id",
    identityDocumentNumber: "N123456",
    identityEvidenceIds: [identityEvidenceId],
  });
  await expect(member.mutation(api.tier1.submitTier1Verification, {})).rejects.toThrow("claimed address");
  await member.mutation(api.tier1.saveTier1AddressDraft, { claimedAddress, claimedAddressRaw: "12 Test Crescent, Ikeja, Lagos, Nigeria" });
  await expect(member.mutation(api.tier1.submitTier1Verification, {})).rejects.toThrow("proof-of-address");
  const saved = await member.mutation(api.tier1.saveTier1ProofOfAddress, {
    proofOfAddressType: "utility_bill",
    proofAddressText: "12 Test Crescent, Ikeja, Lagos",
    proofAddressEvidenceIds: [proofEvidenceId],
  });
  await expect(member.mutation(api.tier1.submitTier1Verification, {})).rejects.toThrow("live address verification");
  await completeLiveVerification(t, member, userId);
  const status = await member.query(api.tier1.getMyVerificationStatus, {});
  expect(status).toMatchObject({
    identityNumberVerified: true,
    kycTier: 0,
    tier: "Tier 0",
    identityStatus: "draft",
    activeSubmission: { status: "draft", hasIdentity: true, hasAddress: true, hasProofOfAddress: true, hasLiveResult: true, hasSecurityAssessment: true },
  });
  const submitted = await member.mutation(api.tier1.submitTier1Verification, {});
  expect(submitted).toMatchObject({ submissionId: saved.submissionId, version: 1, status: "pending" });
  const after = await member.query(api.tier1.getMyVerificationStatus, {});
  expect(after).toMatchObject({
    identityStatus: "pending",
    activeSubmission: { status: "pending", hasIdentity: true, hasAddress: true, hasProofOfAddress: true, hasLiveResult: true, hasSecurityAssessment: true },
  });
  expect(after.activeSubmission?.submittedAt).toBeTypeOf("number");
  await expect(member.mutation(api.tier1.submitTier1Verification, {})).rejects.toThrow("already under review");
  await expect(member.mutation(api.tier1.saveTier1IdentityDraft, {
    legalName: { firstName: "Tier", lastName: "One" },
    identityDocumentType: "national_id",
    identityEvidenceIds: [identityEvidenceId],
  })).rejects.toThrow("already under review");
});

it("preserves the rejected submission and creates a new version on resubmission", async () => {
  const { t, member, userId } = await setup();
  const identityEvidenceId = await addEvidence(t, userId, "identity");
  const proofEvidenceId = await addEvidence(t, userId, "proof_of_address");
  const first = await member.mutation(api.tier1.saveTier1IdentityDraft, {
    legalName: { firstName: "Tier", lastName: "One" },
    identityDocumentType: "national_id",
    identityEvidenceIds: [identityEvidenceId],
  });
  await member.mutation(api.tier1.saveTier1AddressDraft, { claimedAddress, claimedAddressRaw: "12 Test Crescent, Ikeja, Lagos, Nigeria" });
  await member.mutation(api.tier1.saveTier1ProofOfAddress, {
    proofOfAddressType: "utility_bill",
    proofAddressText: "12 Test Crescent, Ikeja, Lagos",
    proofAddressEvidenceIds: [proofEvidenceId],
  });
  await completeLiveVerification(t, member, userId);
  const submitted = await member.mutation(api.tier1.submitTier1Verification, {});
  await t.run(async ctx => {
    await ctx.db.patch(submitted.submissionId, { status: "rejected", reviewNote: "Document could not be read." });
    await ctx.db.patch(userId, { identityVerificationStatus: "rejected", lastVerificationReviewNote: "Document could not be read." });
  });
  const second = await member.mutation(api.tier1.saveTier1IdentityDraft, {
    legalName: { firstName: "Tier", lastName: "One" },
    identityDocumentType: "passport",
    identityEvidenceIds: [identityEvidenceId],
  });
  expect(second.submissionId).not.toBe(submitted.submissionId);
  expect(second.version).toBe(2);
  const submissions = await t.run(ctx => ctx.db.query("verificationSubmissions").withIndex("by_user", q => q.eq("userId", userId)).collect());
  expect(submissions).toHaveLength(2);
  const old = submissions.find(s => s._id === submitted.submissionId)!;
  expect(old.status).toBe("rejected");
  expect(old.identityDocumentType).toBe("national_id");
  const rejectedUser = await t.run(ctx => ctx.db.get(userId));
  expect(rejectedUser?.identityVerificationStatus).toBe("draft");
  expect(rejectedUser?.lastVerificationReviewNote).toBeUndefined();
  const status = await member.query(api.tier1.getMyVerificationStatus, {});
  expect(status.activeSubmission).toMatchObject({ status: "draft", version: 2 });
});

it("refuses to start address verification before an address is saved and caps daily sessions", async () => {
  const { t, member, userId } = await setup();
  await expect(member.mutation(api.tier1.startAddressVerification, {})).rejects.toThrow("Save your claimed address");
  await member.mutation(api.tier1.saveTier1AddressDraft, { claimedAddress, claimedAddressRaw: "12 Test Crescent, Ikeja, Lagos, Nigeria" });
  for (let index = 0; index < verificationPolicy.maxAddressVerificationAttemptsPerDay; index++) {
    const started = await member.mutation(api.tier1.startAddressVerification, {});
    expect(started.token).toBeTypeOf("string");
  }
  await expect(member.mutation(api.tier1.startAddressVerification, {})).rejects.toThrow("today's address-verification attempts");
});

it("rejects submitting another user's session token", async () => {
  const { t, member, stranger, strangerId, userId } = await setup();
  await t.run(ctx => ctx.db.patch(strangerId, { kycTier: 0, identityNumberVerificationType: "NIN", identityNumberVerifiedAt: Date.now(), identityNumberLast4: "0003" }));
  await member.mutation(api.tier1.saveTier1AddressDraft, { claimedAddress, claimedAddressRaw: "12 Test Crescent, Ikeja, Lagos, Nigeria" });
  const started = await member.mutation(api.tier1.startAddressVerification, {});
  const now = Date.now();
  const samples = [
    { latitude: 6.5244, longitude: 3.3792, accuracyMeters: 30, clientCapturedAt: now },
    { latitude: 6.5245, longitude: 3.3791, accuracyMeters: 40, clientCapturedAt: now },
    { latitude: 6.5243, longitude: 3.3793, accuracyMeters: 50, clientCapturedAt: now },
  ];
  await expect(stranger.mutation(api.tier1.submitAddressVerification, {
    sessionId: started.sessionId,
    token: started.token,
    samples,
  })).rejects.toThrow("not found");
});

it("rejects a wrong session token", async () => {
  const { t, member, userId } = await setup();
  await member.mutation(api.tier1.saveTier1AddressDraft, { claimedAddress, claimedAddressRaw: "12 Test Crescent, Ikeja, Lagos, Nigeria" });
  const started = await member.mutation(api.tier1.startAddressVerification, {});
  const now = Date.now();
  const samples = [
    { latitude: 6.5244, longitude: 3.3792, accuracyMeters: 30, clientCapturedAt: now },
    { latitude: 6.5245, longitude: 3.3791, accuracyMeters: 40, clientCapturedAt: now },
    { latitude: 6.5243, longitude: 3.3793, accuracyMeters: 50, clientCapturedAt: now },
  ];
  await expect(member.mutation(api.tier1.submitAddressVerification, {
    sessionId: started.sessionId,
    token: "not-the-token",
    samples,
  })).rejects.toThrow("token is invalid");
});

it("rejects an expired session", async () => {
  const { t, member, userId } = await setup();
  await member.mutation(api.tier1.saveTier1AddressDraft, { claimedAddress, claimedAddressRaw: "12 Test Crescent, Ikeja, Lagos, Nigeria" });
  const started = await member.mutation(api.tier1.startAddressVerification, {});
  await t.run(ctx => ctx.db.patch(started.sessionId, { expiresAt: Date.now() - 1 }));
  const now = Date.now();
  const samples = [
    { latitude: 6.5244, longitude: 3.3792, accuracyMeters: 30, clientCapturedAt: now },
    { latitude: 6.5245, longitude: 3.3791, accuracyMeters: 40, clientCapturedAt: now },
    { latitude: 6.5243, longitude: 3.3793, accuracyMeters: 50, clientCapturedAt: now },
  ];
  await expect(member.mutation(api.tier1.submitAddressVerification, {
    sessionId: started.sessionId,
    token: started.token,
    samples,
  })).rejects.toThrow("expired");
});

it("does not let a completed session be replayed", async () => {
  const { t, member, userId } = await setup();
  await member.mutation(api.tier1.saveTier1AddressDraft, { claimedAddress, claimedAddressRaw: "12 Test Crescent, Ikeja, Lagos, Nigeria" });
  const started = await member.mutation(api.tier1.startAddressVerification, {});
  const now = Date.now();
  const samples = [
    { latitude: 6.5244, longitude: 3.3792, accuracyMeters: 30, clientCapturedAt: now },
    { latitude: 6.5245, longitude: 3.3791, accuracyMeters: 40, clientCapturedAt: now },
    { latitude: 6.5243, longitude: 3.3793, accuracyMeters: 50, clientCapturedAt: now },
  ];
  await member.mutation(api.tier1.submitAddressVerification, { sessionId: started.sessionId, token: started.token, samples });
  await expect(member.mutation(api.tier1.submitAddressVerification, { sessionId: started.sessionId, token: started.token, samples }))
    .rejects.toThrow("no longer active");
});

it("rejects too few usable samples", async () => {
  const { t, member, userId } = await setup();
  await member.mutation(api.tier1.saveTier1AddressDraft, { claimedAddress, claimedAddressRaw: "12 Test Crescent, Ikeja, Lagos, Nigeria" });
  const started = await member.mutation(api.tier1.startAddressVerification, {});
  const now = Date.now();
  const samples = [
    { latitude: 6.5244, longitude: 3.3792, accuracyMeters: 30, clientCapturedAt: now },
    { latitude: 6.5245, longitude: 3.3791, accuracyMeters: 40, clientCapturedAt: now },
  ];
  await expect(member.mutation(api.tier1.submitAddressVerification, { sessionId: started.sessionId, token: started.token, samples }))
    .rejects.toThrow("Location accuracy is too low");
});

it("rejects stale and out-of-range sample readings", async () => {
  const { t, member, userId } = await setup();
  await member.mutation(api.tier1.saveTier1AddressDraft, { claimedAddress, claimedAddressRaw: "12 Test Crescent, Ikeja, Lagos, Nigeria" });
  const started = await member.mutation(api.tier1.startAddressVerification, {});
  const now = Date.now();
  const samples = [
    { latitude: 6.5244, longitude: 3.3792, accuracyMeters: 30, clientCapturedAt: now - 60 * 60 * 1000 },
    { latitude: 6.5245, longitude: 3.3791, accuracyMeters: 40, clientCapturedAt: now },
    { latitude: 6.5243, longitude: 3.3793, accuracyMeters: 50, clientCapturedAt: now },
    { latitude: 999, longitude: 999, accuracyMeters: 10, clientCapturedAt: now },
  ];
  await expect(member.mutation(api.tier1.submitAddressVerification, { sessionId: started.sessionId, token: started.token, samples }))
    .rejects.toThrow("Location accuracy is too low");
});

it("stores the live result and security assessment and never leaks them through public queries", async () => {
  const { t, member, userId } = await setup();
  await member.mutation(api.tier1.saveTier1AddressDraft, { claimedAddress, claimedAddressRaw: "12 Test Crescent, Ikeja, Lagos, Nigeria" });
  await completeLiveVerification(t, member, userId);
  const submission = await t.run(async ctx => {
    const rows = await ctx.db.query("verificationSubmissions").withIndex("by_user", q => q.eq("userId", userId)).collect();
    return rows[0];
  });
  expect(submission.geocodedAddress).toBeUndefined();
  expect(submission.liveAddressResult).toMatchObject({ latitude: 6.5244, longitude: 3.3792, accuracyMeters: 40, verifiedAt: expect.any(Number) });
  expect(submission.securityAssessment?.version).toBe("v1");
  expect(submission.securityAssessment?.decision).toBeTruthy();
  expect(submission.securityAssessment?.score).toBeTypeOf("number");
  const user = await t.run(ctx => ctx.db.get(userId));
  expect(user?.addressVerifiedAt).toBeTypeOf("number");
  expect(user?.securityEngineScore).toBeTypeOf("number");
  const active = await member.query(api.tier1.getMyActiveTier1Submission, {});
  expect(active).not.toHaveProperty("geocodedAddress");
  expect(active).not.toHaveProperty("liveAddressResult");
  expect(active).not.toHaveProperty("securityAssessment");
});

it("clears stale geocoding and live results when the claimed address changes", async () => {
  const { t, member, userId } = await setup();
  await member.mutation(api.tier1.saveTier1AddressDraft, { claimedAddress, claimedAddressRaw: "12 Test Crescent, Ikeja, Lagos, Nigeria" });
  await completeLiveVerification(t, member, userId);
  const changed: typeof claimedAddress = { ...claimedAddress, street: "14 Another Street" };
  await member.mutation(api.tier1.saveTier1AddressDraft, {
    claimedAddress: changed,
    claimedAddressRaw: "14 Another Street, Ikeja, Lagos, Nigeria",
  });
  const submission = await t.run(async ctx => {
    const rows = await ctx.db.query("verificationSubmissions").withIndex("by_user", q => q.eq("userId", userId)).collect();
    return rows[0];
  });
  expect(submission.liveAddressResult).toBeUndefined();
  expect(submission.securityAssessment).toBeUndefined();
});
