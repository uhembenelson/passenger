import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { documentType, normalizedAddress } from "./schema";
import {
  VERIFICATION_ERROR_CODES,
  audit,
  effectiveTierName,
  fail,
  failWithCode,
  getUserTier,
  identityStatus,
  isIdentityNumberVerified,
  requireActive,
  requireUser,
} from "./lib";
import { validateEvidence } from "./evidence";
import { isValidCoordinate, medianCoordinate, tryDistanceMeters, type LocationSample } from "./geo";
import { geocodeAddress } from "./geocoding";
import { runSecurityEngine, type SecurityAssessment } from "./securityEngine";
import { verificationPolicy } from "./verificationPolicy";

type Submission = Doc<"verificationSubmissions">;

async function sha256Hex(value: string): Promise<string> {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

function claimedAddressEquals(a: Submission["claimedAddress"], b: Submission["claimedAddress"]): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

async function latestSubmission(ctx: QueryCtx | MutationCtx, userId: Id<"users">): Promise<Submission | null> {
  const rows = await ctx.db
    .query("verificationSubmissions")
    .withIndex("by_user", q => q.eq("userId", userId))
    .order("desc")
    .take(1);
  return rows[0] ?? null;
}

async function resolveDraft(ctx: MutationCtx, user: Doc<"users">): Promise<Submission> {
  const latest = await latestSubmission(ctx, user._id);
  if (latest?.status === "pending") {
    failWithCode(VERIFICATION_ERROR_CODES.VERIFICATION_PENDING, "Your Tier 1 application is already under review.");
  }
  if (latest?.status === "verified") {
    fail("Your identity is already verified.");
  }
  if (latest?.status === "draft") return latest;

  const version = (latest?.version ?? 0) + 1;
  const id = await ctx.db.insert("verificationSubmissions", {
    userId: user._id,
    type: "tier_1",
    status: "draft",
    version,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });
  const submission = (await ctx.db.get(id))!;

  if (latest?.status === "rejected") {
    await ctx.db.patch(user._id, {
      identityVerificationStatus: "draft",
      lastVerificationReviewNote: undefined,
    });
    await audit(ctx, user, "verification.resubmitted", `Tier 1 verification resubmitted as version ${version}.`);
  } else {
    await ctx.db.patch(user._id, { identityVerificationStatus: "draft" });
    await audit(ctx, user, "verification.tier1_draft_created", `Tier 1 verification draft started as version ${version}.`);
  }
  return submission;
}

async function attachEvidence(
  ctx: MutationCtx,
  user: Doc<"users">,
  submissionId: Id<"verificationSubmissions">,
  ids: Id<"evidence">[],
  kind: "identity" | "proof_of_address",
) {
  await validateEvidence(ctx, ids, user._id, kind);
  for (const id of ids) {
    const e = await ctx.db.get(id);
    if (e && e.verificationSubmissionId === undefined) {
      await ctx.db.patch(id, { verificationSubmissionId: submissionId });
    }
  }
}

export const getMyVerificationStatus = query({
  args: {},
  handler: async ctx => {
    const user = await requireUser(ctx);
    const latest = await latestSubmission(ctx, user._id);
    return {
      identityNumberVerified: isIdentityNumberVerified(user),
      kycTier: getUserTier(user),
      tier: effectiveTierName(user) ?? "No Tier",
      identityStatus: identityStatus(user),
      faceVerificationStatus: user.identityFaceVerificationStatus ?? (user.identityFaceVerifiedAt ? "verified" : "required"),
      activeSubmission: latest
        ? {
            id: latest._id,
            status: latest.status,
            version: latest.version,
            submittedAt: latest.submittedAt,
            reviewedAt: latest.reviewedAt,
            reviewNote: latest.reviewNote,
            reviewDecision: latest.reviewDecision,
            hasIdentity: !!latest.legalName && !!latest.identityDocumentType && !!latest.identityEvidenceIds?.length,
            hasLiveIdentityPhoto: !!latest.liveIdentityEvidenceId,
            faceMatchStatus: latest.faceMatchStatus,
            hasAddress: !!latest.claimedAddress && !!latest.claimedAddressRaw,
            hasProofOfAddress: !!latest.proofAddressText && !!latest.proofAddressEvidenceIds?.length,
            hasLiveResult: !!latest.liveAddressResult,
            hasSecurityAssessment: !!latest.securityAssessment,
          }
        : null,
    };
  },
});

export const getMyActiveTier1Submission = query({
  args: {},
  handler: async ctx => {
    const user = await requireUser(ctx);
    const latest = await latestSubmission(ctx, user._id);
    if (!latest || latest.status === "verified") return null;
    return {
      id: latest._id,
      status: latest.status,
      version: latest.version,
      legalName: latest.legalName,
      identityDocumentType: latest.identityDocumentType,
      identityDocumentNumber: latest.identityDocumentNumber,
      identityEvidenceIds: latest.identityEvidenceIds ?? [],
      liveIdentityEvidenceId: latest.liveIdentityEvidenceId,
      faceMatchStatus: latest.faceMatchStatus,
      claimedAddress: latest.claimedAddress,
      claimedAddressRaw: latest.claimedAddressRaw,
      proofOfAddressType: latest.proofOfAddressType,
      proofAddressText: latest.proofAddressText,
      proofAddressSource: latest.proofAddressSource,
      proofAddressEvidenceIds: latest.proofAddressEvidenceIds ?? [],
      submittedAt: latest.submittedAt,
      reviewedAt: latest.reviewedAt,
      reviewNote: latest.reviewNote,
      reviewDecision: latest.reviewDecision,
    };
  },
});

export const saveTier1LiveIdentityPhoto = mutation({
  args: { evidenceId: v.id("evidence") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    requireActive(user);
    if (!isIdentityNumberVerified(user)) {
      failWithCode(VERIFICATION_ERROR_CODES.IDENTITY_NUMBER_VERIFICATION_REQUIRED, "Verify with BVN or NIN before taking your live identity photo.");
    }
    if (!user.identityBioData?.imageBase64) {
      fail("The identity provider did not supply a reference photo. Contact support before continuing.");
    }
    await validateEvidence(ctx, [args.evidenceId], user._id, "identity");
    const evidence = await ctx.db.get(args.evidenceId);
    if (!evidence || evidence.kind !== "verification_live_photo" || !evidence.contentType.startsWith("image/")) {
      fail("Take a new live photo with the front camera.");
    }
    const submission = await resolveDraft(ctx, user);
    await ctx.db.patch(evidence._id, { verificationSubmissionId: submission._id });
    await ctx.db.patch(submission._id, {
      liveIdentityEvidenceId: evidence._id, faceMatchStatus: undefined, faceMatchScore: undefined,
      faceMatchEvidenceId: undefined, faceMatchProviderIdentityId: undefined,
      faceMatchedAt: undefined, facePotentialDuplicate: undefined, updatedAt: Date.now(),
    });
    await ctx.db.patch(user._id, { identityFaceVerificationStatus: "captured" });
    await audit(ctx, user, "verification.live_identity_captured", "Live identity photo captured for comparison with the verified identity-provider image.");
    return { submissionId: submission._id, status: "captured" as const };
  },
});

export const saveTier1IdentityDraft = mutation({
  args: {
    legalName: v.object({
      firstName: v.string(),
      middleName: v.optional(v.string()),
      lastName: v.string(),
    }),
    identityDocumentType: documentType,
    identityDocumentNumber: v.optional(v.string()),
    identityEvidenceIds: v.array(v.id("evidence")),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    requireActive(user);
    if (!isIdentityNumberVerified(user)) {
      failWithCode(VERIFICATION_ERROR_CODES.IDENTITY_NUMBER_VERIFICATION_REQUIRED, "Verify with BVN or NIN before starting your Tier 1 application.");
    }
    if (getUserTier(user) === null) {
      failWithCode(VERIFICATION_ERROR_CODES.IDENTITY_NUMBER_VERIFICATION_REQUIRED, "Verify with BVN or NIN to start your Tier 1 application.");
    }

    const firstName = args.legalName.firstName.trim();
    const lastName = args.legalName.lastName.trim();
    const middleName = args.legalName.middleName?.trim();
    if (!firstName || firstName.length > 80) fail("Enter a first name up to 80 characters.");
    if (!lastName || lastName.length > 80) fail("Enter a last name up to 80 characters.");
    if (middleName && middleName.length > 80) fail("Enter a middle name up to 80 characters.");

    const number = args.identityDocumentNumber?.trim();
    if (number && number.length > 40) fail("Enter a document number up to 40 characters.");

    const submission = await resolveDraft(ctx, user);
    await attachEvidence(ctx, user, submission._id, args.identityEvidenceIds, "identity");
    await ctx.db.patch(submission._id, {
      legalName: { firstName, middleName: middleName || undefined, lastName },
      identityDocumentType: args.identityDocumentType,
      identityDocumentNumber: number || undefined,
      identityEvidenceIds: args.identityEvidenceIds,
      updatedAt: Date.now(),
    });
    await audit(ctx, user, "verification.identity_evidence_added", "Tier 1 identity draft saved with identity evidence.");
    return { submissionId: submission._id, version: submission.version, status: "draft" as const };
  },
});

export const saveTier1AddressDraft = mutation({
  args: {
    claimedAddress: normalizedAddress,
    claimedAddressRaw: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    requireActive(user);
    if (!isIdentityNumberVerified(user)) {
      failWithCode(VERIFICATION_ERROR_CODES.IDENTITY_NUMBER_VERIFICATION_REQUIRED, "Verify with BVN or NIN before starting your Tier 1 application.");
    }
    if (getUserTier(user) === null) {
      failWithCode(VERIFICATION_ERROR_CODES.IDENTITY_NUMBER_VERIFICATION_REQUIRED, "Verify with BVN or NIN to start your Tier 1 application.");
    }

    for (const field of ["street", "city", "state"] as const) {
      if (!args.claimedAddress[field]?.trim()) fail("Address must include a complete street, city and state.");
    }

    const raw = args.claimedAddressRaw.trim();
    if (raw.length < 12 || raw.length > 300) fail("Enter the claimed address as a sentence of 12–300 characters.");

    const submission = await resolveDraft(ctx, user);
    const addressChanged = !claimedAddressEquals(submission.claimedAddress, args.claimedAddress);
    await ctx.db.patch(submission._id, {
      claimedAddress: args.claimedAddress,
      claimedAddressRaw: raw,
      ...(addressChanged
        ? {
            geocodedAddress: undefined,
            liveAddressResult: undefined,
            securityAssessment: undefined,
          }
        : {}),
      updatedAt: Date.now(),
    });
    await audit(ctx, user, "verification.tier1_address_saved", "Tier 1 claimed address saved.");
    return { submissionId: submission._id, version: submission.version, status: "draft" as const };
  },
});

export const saveTier1ProofOfAddress = mutation({
  args: {
    proofOfAddressType: v.string(),
    proofAddressText: v.string(),
    proofAddressEvidenceIds: v.array(v.id("evidence")),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    requireActive(user);
    if (!isIdentityNumberVerified(user)) {
      failWithCode(VERIFICATION_ERROR_CODES.IDENTITY_NUMBER_VERIFICATION_REQUIRED, "Verify with BVN or NIN before starting your Tier 1 application.");
    }
    if (getUserTier(user) === null) {
      failWithCode(VERIFICATION_ERROR_CODES.IDENTITY_NUMBER_VERIFICATION_REQUIRED, "Verify with BVN or NIN to start your Tier 1 application.");
    }

    const proofType = args.proofOfAddressType.trim();
    if (!proofType || proofType.length > 80) fail("Enter the proof-of-address type (e.g. utility bill) up to 80 characters.");

    const addressText = args.proofAddressText.trim();
    if (addressText.length < 8 || addressText.length > 300) fail("Type the address shown on the document (8–300 characters).");

    const submission = await resolveDraft(ctx, user);
    await attachEvidence(ctx, user, submission._id, args.proofAddressEvidenceIds, "proof_of_address");
    await ctx.db.patch(submission._id, {
      proofOfAddressType: proofType,
      proofAddressText: addressText,
      proofAddressSource: "user_entered",
      proofAddressEvidenceIds: args.proofAddressEvidenceIds,
      updatedAt: Date.now(),
    });
    await audit(ctx, user, "verification.proof_address_added", "Tier 1 proof-of-address added.");
    return { submissionId: submission._id, version: submission.version, status: "draft" as const };
  },
});

export const startAddressVerification = mutation({
  args: {},
  handler: async ctx => {
    const user = await requireUser(ctx);
    requireActive(user);
    if (!isIdentityNumberVerified(user)) {
      failWithCode(VERIFICATION_ERROR_CODES.IDENTITY_NUMBER_VERIFICATION_REQUIRED, "Verify with BVN or NIN before starting address verification.");
    }
    if ((getUserTier(user) ?? -1) < 0) {
      failWithCode(VERIFICATION_ERROR_CODES.IDENTITY_NUMBER_VERIFICATION_REQUIRED, "Verify with BVN or NIN to start address verification.");
    }

    const submission = await latestSubmission(ctx, user._id);
    if (submission?.status === "pending") {
      failWithCode(VERIFICATION_ERROR_CODES.VERIFICATION_PENDING, "Your Tier 1 application is already under review.");
    }
    if (!submission || submission.status !== "draft" || !submission.claimedAddress?.street) {
      failWithCode(VERIFICATION_ERROR_CODES.ADDRESS_VERIFICATION_REQUIRED, "Save your claimed address before starting address verification.");
    }

    // Abuse control (plan §27): cap live address-verification sessions per day.
    const dayStart = Date.now() - 24 * 60 * 60 * 1000;
    const recent = await ctx.db.query("addressVerificationSessions").withIndex("by_user", q => q.eq("userId", user._id)).collect();
    const recentCount = recent.filter(session => session.createdAt >= dayStart).length;
    if (recentCount >= verificationPolicy.maxAddressVerificationAttemptsPerDay) {
      failWithCode(VERIFICATION_ERROR_CODES.ADDRESS_VERIFICATION_REQUIRED, "You have used today's address-verification attempts. Try again tomorrow.");
    }

    // Geocode the claimed address once per submission and cache it (plan §9).
    let geocoded = submission.geocodedAddress;
    if (!geocoded) {
      const result = await geocodeAddress(
        [submission.claimedAddress.houseNumberOrName, submission.claimedAddress.street, submission.claimedAddress.area, submission.claimedAddress.city, submission.claimedAddress.lga, submission.claimedAddress.state]
          .filter(Boolean)
          .join(", "),
      );
      if (result) {
        geocoded = {
          latitude: result.latitude,
          longitude: result.longitude,
          formattedAddress: result.formattedAddress,
          confidence: result.confidence,
          provider: "mapbox",
        };
        await ctx.db.patch(submission._id, { geocodedAddress: geocoded, updatedAt: Date.now() });
      }
    }

    const token = crypto.randomUUID();
    const tokenHash = await sha256Hex(token);
    const now = Date.now();
    const sessionId = await ctx.db.insert("addressVerificationSessions", {
      userId: user._id,
      submissionId: submission._id,
      tokenHash,
      status: "active",
      createdAt: now,
      expiresAt: now + verificationPolicy.addressSessionDurationMs,
      attempts: 0,
    });

    await audit(ctx, user, "verification.address_session_started", "Live address verification session started.");
    return { sessionId, token, expiresAt: now + verificationPolicy.addressSessionDurationMs };
  },
});

export const submitAddressVerification = mutation({
  args: {
    sessionId: v.id("addressVerificationSessions"),
    token: v.string(),
    samples: v.array(
      v.object({
        latitude: v.number(),
        longitude: v.number(),
        accuracyMeters: v.number(),
        clientCapturedAt: v.number(),
      }),
    ),
    deviceSignals: v.optional(
      v.object({
        mockedLocation: v.optional(v.boolean()),
        platform: v.optional(v.string()),
        appVersion: v.optional(v.string()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    requireActive(user);
    if (!isIdentityNumberVerified(user)) {
      failWithCode(VERIFICATION_ERROR_CODES.IDENTITY_NUMBER_VERIFICATION_REQUIRED, "Verify with BVN or NIN before submitting address verification.");
    }

    const session = await ctx.db.get(args.sessionId);
    if (!session || session.userId !== user._id) {
      failWithCode(VERIFICATION_ERROR_CODES.NOT_AUTHORISED, "Address verification session not found.");
    }

    const tokenHash = await sha256Hex(args.token);
    if (session.tokenHash !== tokenHash) {
      failWithCode(VERIFICATION_ERROR_CODES.NOT_AUTHORISED, "Address verification session token is invalid.");
    }

    const now = Date.now();
    if (session.status !== "active") {
      failWithCode(VERIFICATION_ERROR_CODES.ADDRESS_SESSION_EXPIRED, "Address verification session is no longer active.");
    }
    if (now > session.expiresAt) {
      await ctx.db.patch(session._id, { status: "expired" });
      failWithCode(VERIFICATION_ERROR_CODES.ADDRESS_SESSION_EXPIRED, "Address verification session has expired. Start a new one.");
    }

    // Keep a usable sample only if coordinates are valid, accuracy is within the
    // accepted band, and the capture time is not stale (plan §12).
    const usable = args.samples.filter(sample => {
      if (!isValidCoordinate(sample.latitude, sample.longitude)) return false;
      if (sample.accuracyMeters < 0 || sample.accuracyMeters > verificationPolicy.maxAcceptedLocationAccuracyMeters) return false;
      const age = Math.abs(now - sample.clientCapturedAt);
      return age <= verificationPolicy.locationSampleMaxAgeMs;
    });

    const attempts = session.attempts + 1;
    if (usable.length < verificationPolicy.minimumLocationSamples) {
      const reachedMax = attempts >= verificationPolicy.addressSessionMaxAttempts;
      await ctx.db.patch(session._id, {
        attempts,
        ...(reachedMax ? { status: "expired" } : {}),
      });
      await audit(ctx, user, "verification.address_session_failed", "Live address verification failed on insufficient or stale location samples.");
      failWithCode(
        VERIFICATION_ERROR_CODES.LOCATION_ACCURACY_TOO_LOW,
        reachedMax ? "Too many failed attempts. Start a new address verification session." : "Location accuracy is too low or samples are stale. Try again.",
      );
    }

    const median = medianCoordinate(
      usable.map(sample => ({ latitude: sample.latitude, longitude: sample.longitude, accuracyMeters: sample.accuracyMeters }) satisfies LocationSample),
    );

    const submission = await ctx.db.get(session.submissionId);
    if (!submission) failWithCode(VERIFICATION_ERROR_CODES.NOT_AUTHORISED, "Verification submission not found.");
    const geocodedAddress = submission.geocodedAddress;
    const distanceFromClaimedMeters: number | undefined | null = geocodedAddress
      ? tryDistanceMeters(
          { latitude: geocodedAddress.latitude, longitude: geocodedAddress.longitude },
          { latitude: median.latitude, longitude: median.longitude },
        )
      : null;
    const hasDistance = distanceFromClaimedMeters !== null && distanceFromClaimedMeters !== undefined;

    await ctx.db.patch(session._id, {
      status: "completed",
      completedAt: now,
      attempts,
      result: {
        latitude: median.latitude,
        longitude: median.longitude,
        accuracyMeters: median.accuracyMeters,
        sampleCount: median.sampleCount,
        ...(hasDistance ? { distanceFromClaimedMeters: distanceFromClaimedMeters as number } : {}),
      },
      ...(args.deviceSignals ? { deviceSignals: args.deviceSignals } : {}),
    });
    await ctx.db.patch(submission._id, {
      liveAddressResult: {
        latitude: median.latitude,
        longitude: median.longitude,
        accuracyMeters: median.accuracyMeters,
        ...(hasDistance ? { distanceMeters: distanceFromClaimedMeters as number } : {}),
        verifiedAt: now,
      },
      updatedAt: now,
    });
    await ctx.db.patch(user._id, { addressVerifiedAt: now });

    await audit(ctx, user, "verification.address_session_completed", `Live address verification completed (${median.sampleCount} samples accepted).`);
    return {
      status: "completed" as const,
      sampleCount: median.sampleCount,
      accuracyMeters: median.accuracyMeters,
      ...(hasDistance ? { distanceFromClaimedMeters: distanceFromClaimedMeters as number } : {}),
    };
  },
});

export const runSecurityAssessment = mutation({
  args: {},
  handler: async ctx => {
    const user = await requireUser(ctx);
    requireActive(user);
    if (!isIdentityNumberVerified(user)) {
      failWithCode(VERIFICATION_ERROR_CODES.IDENTITY_NUMBER_VERIFICATION_REQUIRED, "Verify with BVN or NIN before running the security assessment.");
    }

    const submission = await latestSubmission(ctx, user._id);
    if (!submission || submission.status !== "draft") {
      failWithCode(VERIFICATION_ERROR_CODES.ADDRESS_VERIFICATION_REQUIRED, "Save your Tier 1 application before running the security assessment.");
    }
    if (!submission.claimedAddress?.street || !submission.proofAddressText) {
      failWithCode(VERIFICATION_ERROR_CODES.ADDRESS_VERIFICATION_REQUIRED, "Complete your claimed address and proof of address first.");
    }
    if (!submission.liveAddressResult) {
      failWithCode(VERIFICATION_ERROR_CODES.ADDRESS_VERIFICATION_REQUIRED, "Complete the live address verification before running the security assessment.");
    }

    // Pull device signals and prior-attempt history from the user's sessions.
    const sessions = await ctx.db.query("addressVerificationSessions").withIndex("by_user", q => q.eq("userId", user._id)).collect();
    const completedSession = sessions.find(session => session.status === "completed" && session.submissionId === submission._id);

    const assessment: SecurityAssessment = runSecurityEngine(
      {
        userId: user._id,
        claimedAddress: submission.claimedAddress,
        claimedAddressGeo: submission.geocodedAddress
          ? { latitude: submission.geocodedAddress.latitude, longitude: submission.geocodedAddress.longitude, provider: submission.geocodedAddress.provider }
          : null,
        proofAddressText: submission.proofAddressText,
        identityDocumentAddressText: submission.identityDocumentAddressText,
        liveLocation: submission.liveAddressResult
          ? {
              latitude: submission.liveAddressResult.latitude,
              longitude: submission.liveAddressResult.longitude,
              accuracyMeters: submission.liveAddressResult.accuracyMeters,
              capturedAt: submission.liveAddressResult.verifiedAt,
              sampleCount: completedSession?.result?.sampleCount ?? 1,
            }
          : null,
        deviceSignals: completedSession?.deviceSignals ?? null,
        priorVerificationAttempts: sessions.length,
      },
      verificationPolicy,
    );

    await ctx.db.patch(submission._id, { securityAssessment: assessment, updatedAt: Date.now() });
    await ctx.db.patch(user._id, {
      securityEngineScore: assessment.score,
      securityEngineDecision: assessment.decision,
      addressVerificationConfidence: assessment.score,
    });
    await audit(ctx, user, "verification.security_assessed", `Tier 1 verification security assessment recorded.`);
    return { status: "assessed" as const };
  },
});

export const submitTier1Verification = mutation({
  args: {},
  handler: async ctx => {
    const user = await requireUser(ctx);
    requireActive(user);
    if (!isIdentityNumberVerified(user)) {
      failWithCode(VERIFICATION_ERROR_CODES.IDENTITY_NUMBER_VERIFICATION_REQUIRED, "Verify with BVN or NIN before submitting your Tier 1 application.");
    }
    if ((getUserTier(user) ?? -1) < 0) {
      failWithCode(VERIFICATION_ERROR_CODES.IDENTITY_NUMBER_VERIFICATION_REQUIRED, "Verify with BVN or NIN to submit your Tier 1 application.");
    }

    const submission = await latestSubmission(ctx, user._id);
    if (submission?.status === "pending") {
      failWithCode(VERIFICATION_ERROR_CODES.VERIFICATION_PENDING, "Your Tier 1 application is already under review.");
    }
    if (!submission || submission.status !== "draft") {
      failWithCode(VERIFICATION_ERROR_CODES.EVIDENCE_REQUIRED, "Complete your Tier 1 application before submitting.");
    }

    if (!submission.legalName?.firstName || !submission.legalName.lastName) fail("Add your legal name to complete the application.");
    if (!submission.identityDocumentType) fail("Choose an identity document type to complete the application.");
    if (!submission.identityEvidenceIds?.length) {
      failWithCode(VERIFICATION_ERROR_CODES.EVIDENCE_REQUIRED, "Upload identity document evidence to complete the application.");
    }
    if (!submission.claimedAddress || !submission.claimedAddressRaw) fail("Add your claimed address to complete the application.");
    if (!submission.proofOfAddressType || !submission.proofAddressText) fail("Add your proof-of-address to complete the application.");
    if (!submission.proofAddressEvidenceIds?.length) {
      failWithCode(VERIFICATION_ERROR_CODES.EVIDENCE_REQUIRED, "Upload proof-of-address evidence to complete the application.");
    }
    if (!submission.liveAddressResult) {
      failWithCode(VERIFICATION_ERROR_CODES.ADDRESS_VERIFICATION_REQUIRED, "Complete the live address verification to submit your application.");
    }
    if (!submission.securityAssessment) {
      failWithCode(VERIFICATION_ERROR_CODES.ADDRESS_VERIFICATION_REQUIRED, "Run the security assessment to submit your application.");
    }
    if (user.identityBioData?.imageBase64 && !submission.liveIdentityEvidenceId) {
      failWithCode(VERIFICATION_ERROR_CODES.EVIDENCE_REQUIRED, "Take a live identity photo before submitting your application.");
    }
    if (user.identityBioData?.imageBase64 &&
        (submission.faceMatchStatus !== "matched" || submission.faceMatchEvidenceId !== submission.liveIdentityEvidenceId ||
          submission.faceMatchProviderIdentityId !== user.identityNumberProviderReference)) {
      failWithCode(VERIFICATION_ERROR_CODES.EVIDENCE_REQUIRED, "Complete the live face check before submitting your application.");
    }

    await validateEvidence(ctx, submission.identityEvidenceIds, user._id, "identity");
    await validateEvidence(ctx, submission.proofAddressEvidenceIds, user._id, "proof_of_address");

    const submittedAt = Date.now();
    await ctx.db.patch(submission._id, { status: "pending", submittedAt, updatedAt: submittedAt });
    await ctx.db.patch(user._id, {
      verification: "pending",
      identityVerificationStatus: "pending",
      identityFaceVerificationStatus: submission.liveIdentityEvidenceId ? "pending" : user.identityFaceVerificationStatus,
      identitySubmittedAt: submittedAt,
    });
    await audit(ctx, user, "verification.submitted", "Tier 1 verification submitted for review.");
    return { submissionId: submission._id, version: submission.version, status: "pending" as const, submittedAt };
  },
});
