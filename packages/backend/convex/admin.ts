import { v } from "convex/values";
import { PERMISSIONS } from "@passenger/core";
import { mutation } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { audit, fail, failWithCode, getUserTier, identityStatus, noOpenDispute, note, notify, releaseCapacity, requireAdmin, requirePermission, requireUser, shipment, transition, VERIFICATION_ERROR_CODES } from "./lib";
import { stripLegacyTripPricePerKg } from "./maintenance";

export const reviewUser = mutation({
  args: {
    userId: v.id("users"),
    decision: v.union(v.literal("verified"), v.literal("rejected")),
    tier: v.optional(v.union(v.literal("Tier 1"), v.literal("Tier 2"), v.literal("Tier 3"))),
    note: v.string(),
  },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    await requirePermission(ctx, admin, PERMISSIONS.COMPLIANCE_MANAGE);
    const user = await ctx.db.get(args.userId);
    if (!user) fail("Member not found.");
    if (user._id === admin._id) fail("An administrator cannot review their own identity.");

    const detail = note(args.note, "Review note", 5);
    const patch: { verification: typeof user.verification; identityNote: string; identityReviewedAt: number; tier?: "Tier 1" | "Tier 2" | "Tier 3"; kycTier?: 0 | 1 | 2 | 3; identityVerificationStatus?: typeof user.identityVerificationStatus } = {
      verification: args.decision,
      identityNote: detail,
      identityReviewedAt: Date.now(),
    };
    if (args.decision === "verified") {
      patch.kycTier = Number((args.tier ?? user.tier ?? "Tier 1").replace("Tier ", "")) as 1 | 2 | 3;
      patch.identityVerificationStatus = "verified";
    } else {
      patch.identityVerificationStatus = "rejected";
      patch.kycTier = 0;
    }
    if (args.decision === "verified" && args.tier) patch.tier = args.tier;
    if (args.decision === "verified" && !user.tier) patch.tier = args.tier ?? "Tier 1";
    await ctx.db.patch(user._id, patch);
    await notify(ctx, user._id, args.decision === "verified" ? "Identity verified" : "Identity needs changes", args.decision === "verified" ? "Your identity review is complete. Your account is verified." : detail);
    await audit(ctx, admin, "user.reviewed", `Manual identity review for ${user._id}: ${args.decision}.${patch.tier ? ` Assigned ${patch.tier}.` : ""} ${detail}`);
  },
});

// Compliance-only repair for accounts that were incorrectly marked as phone
// verified (for example, legacy accounts that received a synthetic number).
// The name lookup is deliberately exact and rejects ambiguity so an operator
// cannot accidentally change the wrong member.
export const rollbackPhoneVerification = mutation({
  args: {
    name: v.string(),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    await requirePermission(ctx, admin, PERMISSIONS.COMPLIANCE_MANAGE);

    const requestedName = args.name.trim().toLocaleLowerCase();
    if (!requestedName) fail("Member name is required.");
    const matches = (await ctx.db.query("users").collect()).filter(
      user => user.name.trim().toLocaleLowerCase() === requestedName,
    );
    if (matches.length === 0) fail("Member not found.");
    if (matches.length > 1) fail("More than one member has that name. Use an account-specific repair flow.");

    const user = matches[0];
    if (!user.phoneVerificationTime && !user.phoneVerifiedAt && !user.phone.trim()) {
      fail("The member is already unverified.");
    }

    const detail = note(args.reason, "Phone verification rollback reason", 5);
    const hasIndependentIdentity =
      user.identityVerificationStatus === "verified" ||
      user.verification === "verified" ||
      user.identityVerifiedAt !== undefined;
    await ctx.db.patch(user._id, {
      phone: "",
      phoneVerificationTime: undefined,
      phoneVerifiedAt: undefined,
      phoneVerificationCode: undefined,
      phoneVerificationAttempts: undefined,
      phoneVerificationPendingPhone: undefined,
      phoneVerificationExpiresAt: undefined,
      phoneVerificationRequestedAt: undefined,
      // A phone-only account should not retain the placeholder KYC tier.
      ...(hasIndependentIdentity || user.kycTier !== 0 ? {} : { kycTier: undefined }),
    });
    await audit(ctx, admin, "user.phone_verification.rolled_back", `Rolled back phone verification for ${user._id}. ${detail}`);
    return { userId: user._id, name: user.name };
  },
});

export const updateUserTier = mutation({
  args: {
    userId: v.id("users"),
    tier: v.union(v.literal("Tier 1"), v.literal("Tier 2"), v.literal("Tier 3")),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    await requirePermission(ctx, admin, PERMISSIONS.COMPLIANCE_MANAGE);
    const user = await ctx.db.get(args.userId);
    if (!user) fail("Member not found.");
    const currentTier = getUserTier(user);
    const targetTier = Number(args.tier.replace("Tier ", "")) as 1 | 2 | 3;
    if (currentTier === targetTier) fail("The member already has that tier.");

    // Tier 1+ normally requires a verified identity. A privileged override is
    // allowed only with an explicit documented reason (plan §admin.ts).
    const verified = identityStatus(user) === "verified";
    const override = !verified;
    if (override) {
      if (!args.reason) fail("Assigning a tier requires a verified identity. Supply a reason to override.");
      const detail = note(args.reason, "Override reason", 5);
      await ctx.db.patch(user._id, { tier: args.tier, kycTier: targetTier });
      await audit(ctx, admin, "user.tier.overridden", `Assigned ${args.tier} to ${user._id} with override reason: ${detail}`);
      return;
    }
    await ctx.db.patch(user._id, { tier: args.tier, kycTier: targetTier });
    await audit(ctx, admin, "user.tier.updated", `Changed tier for ${user._id} to ${args.tier}.`);
  },
});

// Submission-based review (plan §admin.ts). The full security assessment must
// exist before a compliance reviewer approves or rejects a Tier 1 application.
// The reviewer's own submissions are never reviewable, and a submission that
// is no longer pending (e.g. already reviewed) cannot be reviewed again.
export const reviewVerificationSubmission = mutation({
  args: {
    submissionId: v.id("verificationSubmissions"),
    decision: v.union(v.literal("verified"), v.literal("rejected")),
    note: v.string(),
  },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    await requirePermission(ctx, admin, PERMISSIONS.COMPLIANCE_MANAGE);

    const submission = await ctx.db.get(args.submissionId);
    if (!submission) fail("Verification submission not found.");
    if (submission.userId === admin._id) failWithCode(VERIFICATION_ERROR_CODES.SELF_REVIEW_NOT_ALLOWED, "An administrator cannot review their own verification.");
    if (submission.status !== "pending") fail("Only pending verification submissions may be reviewed.");
    if (!submission.securityAssessment) failWithCode(VERIFICATION_ERROR_CODES.ADDRESS_VERIFICATION_REQUIRED, "The security assessment must be completed before review.");

    const now = Date.now();
    const user = await ctx.db.get(submission.userId);
    if (!user) fail("Member not found.");
    if (user.identityBioData?.imageBase64 && !submission.liveIdentityEvidenceId) {
      failWithCode(VERIFICATION_ERROR_CODES.EVIDENCE_REQUIRED, "A live identity photo is required before this verification can be reviewed.");
    }
    if (args.decision === "verified" && user.identityBioData?.imageBase64 &&
        (submission.faceMatchStatus !== "matched" || submission.faceMatchEvidenceId !== submission.liveIdentityEvidenceId ||
          submission.faceMatchProviderIdentityId !== user.identityNumberProviderReference)) {
      failWithCode(VERIFICATION_ERROR_CODES.EVIDENCE_REQUIRED, "The live face must match the verified BVN/NIN image before approval.");
    }

    const userDoc = user as Doc<"users">;
    const currentTier = getUserTier(userDoc) ?? 0;
    const detail = note(args.note, "Review explanation", 5);

    if (args.decision === "verified") {
      await ctx.db.patch(submission._id, {
        status: "verified",
        reviewDecision: "verified",
        reviewNote: detail,
        reviewedAt: now,
        reviewedBy: admin._id,
        updatedAt: now,
      });
      await ctx.db.patch(user._id, {
        verification: "verified",
        identityVerificationStatus: "verified",
        identityFaceVerificationStatus: submission.liveIdentityEvidenceId ? "verified" : user.identityFaceVerificationStatus,
        identityFaceVerifiedAt: submission.liveIdentityEvidenceId ? now : user.identityFaceVerifiedAt,
        kycTier: Math.max(currentTier, 1) as 0 | 1 | 2 | 3,
        identityVerifiedAt: now,
        identityReviewedAt: now,
        identityNote: detail,
        securityEngineScore: submission.securityAssessment.score,
        securityEngineDecision: submission.securityAssessment.decision,
        lastVerificationReviewNote: detail,
        lastVerificationReviewedAt: now,
        lastVerificationReviewedBy: admin._id,
        ...(submission.liveAddressResult
          ? {
              addressVerifiedAt: submission.liveAddressResult.verifiedAt,
              addressVerificationConfidence: submission.securityAssessment.score,
            }
          : {}),
      });
      await notify(ctx, user._id, "Identity verified", "Your identity and address verification are complete.");
      await audit(ctx, admin, "verification.approved", `Tier 1 approved for ${user._id} on submission ${submission._id}. Score ${submission.securityAssessment.score}. ${detail}`);
    } else {
      await ctx.db.patch(submission._id, {
        status: "rejected",
        reviewDecision: "rejected",
        reviewedAt: now,
        reviewedBy: admin._id,
        reviewNote: detail,
        updatedAt: now,
      });
      await ctx.db.patch(user._id, {
        verification: "rejected",
        identityVerificationStatus: "rejected",
        identityFaceVerificationStatus: submission.liveIdentityEvidenceId ? "rejected" : user.identityFaceVerificationStatus,
        kycTier: 0,
        identityReviewedAt: now,
        identityNote: detail,
        lastVerificationReviewNote: detail,
        lastVerificationReviewedAt: now,
        lastVerificationReviewedBy: admin._id,
      });
      await notify(ctx, user._id, "Identity review needs changes", detail);
      await audit(ctx, admin, "verification.rejected", `Tier 1 rejected for ${user._id} on submission ${submission._id}. ${detail}`);
    }
  },
});

export const reviewShipment = mutation({
  args: {
    shipmentId: v.id("shipments"),
    decision: v.union(v.literal("approve"), v.literal("reject")),
    note: v.string(),
  },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    await requirePermission(ctx, admin, PERMISSIONS.DELIVERIES_MANAGE);
    const s = await shipment(ctx, args.shipmentId);
    const detail = note(args.note, "Review note", 5);

    if (s.senderId === admin._id) fail("An administrator cannot approve their own package.");
    if (s.status !== "pending_review") fail("Only pending packages may be reviewed.");

    await transition(ctx, s, args.decision === "approve" ? "open" : "rejected");
    await ctx.db.patch(s._id, {
      approved: args.decision === "approve",
      reviewNote: detail,
      updatedAt: Date.now(),
    });
    await audit(ctx, admin, "shipment.reviewed", `Safety review: ${args.decision}. ${detail}`, s._id);
  },
});

async function reconcile(
  ctx: MutationCtx,
  admin: Doc<"users">,
  shipmentId: Id<"shipments">,
  kind: "refund" | "release",
  externalReference: string,
) {
  const reference = note(externalReference, "External reconciliation reference", 3, 200);
  const existing = await ctx.db.query("reconciliations").withIndex("by_external_reference", q => q.eq("externalReference", reference)).unique();
  if (existing) fail("This external reconciliation reference has already been recorded.");
  await ctx.db.insert("reconciliations", { shipmentId, actorId: admin._id, kind, externalReference: reference, createdAt: Date.now() });
  return reference;
}

async function deleteAll(ctx: MutationCtx, table: string) {
  const rows = await (ctx.db.query(table as never) as any).collect();
  for (const row of rows) await ctx.db.delete(row._id);
  return rows.length as number;
}

export const resolveDispute = mutation({
  args: {
    disputeId: v.id("disputes"),
    resolution: v.union(v.literal("refund"), v.literal("release")),
    note: v.string(),
    externalReference: v.string(),
  },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    await requirePermission(ctx, admin, PERMISSIONS.PAYMENTS_MANAGE);
    const dispute = await ctx.db.get(args.disputeId);
    if (!dispute || dispute.status !== "open") fail("Open dispute not found.");

    const s = await shipment(ctx, dispute.shipmentId);
    const detail = note(args.note, "Resolution note", 5);
    if (s.senderId === admin._id || s.travellerId === admin._id) fail("Participants cannot reconcile their own disputes.");
    if (s.status !== "disputed" || s.paymentStatus !== "held") fail("Reconciliation requires a disputed shipment with provider-confirmed funds.");

    const reference = await reconcile(ctx, admin, s._id, args.resolution, args.externalReference);
    await ctx.db.patch(dispute._id, {
      status: "resolved",
      resolution: args.resolution,
      externalReference: reference,
      note: detail,
      resolvedAt: Date.now(),
    });
    await ctx.db.patch(s._id, { paymentStatus: args.resolution === "refund" ? "refunded" : "released", updatedAt: Date.now() });
    if (args.resolution === "refund" && ["matched", "funded"].includes(dispute.previousStatus)) await releaseCapacity(ctx, s);
    await audit(ctx, admin, "dispute.reconciled", `Recorded externally completed ${args.resolution}. Reference: ${reference}. ${detail} No money moved by Passenger.`, s._id);
  },
});

export const recordPayout = mutation({
  args: { shipmentId: v.id("shipments"), externalReference: v.string(), note: v.string() },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    await requirePermission(ctx, admin, PERMISSIONS.PAYMENTS_MANAGE);
    const s = await shipment(ctx, args.shipmentId);
    const detail = note(args.note, "Reconciliation note", 5);

    if (s.senderId === admin._id || s.travellerId === admin._id) fail("Participants cannot reconcile their own payouts.");
    await noOpenDispute(ctx, s._id);
    if (s.status !== "delivered" || s.paymentStatus !== "held") fail("Only delivered, unreconciled shipments may have a payout recorded.");

    const reference = await reconcile(ctx, admin, s._id, "release", args.externalReference);
    await ctx.db.patch(s._id, { paymentStatus: "released", updatedAt: Date.now() });
    await audit(ctx, admin, "payout.reconciled", `Recorded externally completed payout. Reference: ${reference}. ${detail} No money moved by Passenger.`, s._id);
  },
});

export const migrateLegacyTripPricing = mutation({
  args: {},
  handler: async (ctx) => {
    const admin = await requireAdmin(ctx);
    const result = await stripLegacyTripPricePerKg(ctx);
    await audit(ctx, admin, "maintenance.legacy_trip_pricing_removed", `Removed legacy pricePerKg from ${result.updated} trip record(s).`);
    return result;
  },
});

export const resetAllData = mutation({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);

    const evidence = await ctx.db.query("evidence").collect();
    const users = await ctx.db.query("users").collect();
    const storageIds = new Set([
      ...evidence.map(item => item.storageId),
      ...users.flatMap(user => user.profileImageStorageId ? [user.profileImageStorageId] : []),
    ]);

    let storageDeleted = 0;
    for (const storageId of storageIds) {
      try {
        await ctx.storage.delete(storageId);
        storageDeleted += 1;
      } catch {
        // Missing blobs should not block a full dev reset.
      }
    }

    const counts = {
      payouts: await deleteAll(ctx, "payouts"),
      reconciliations: await deleteAll(ctx, "reconciliations"),
      payments: await deleteAll(ctx, "payments"),
      walletTransactions: await deleteAll(ctx, "walletTransactions"),
      supportChats: await deleteAll(ctx, "supportChats"),
      supportMessages: await deleteAll(ctx, "supportMessages"),
      faqs: await deleteAll(ctx, "faqs"),
      bankAccounts: await deleteAll(ctx, "bankAccounts"),
      reviews: await deleteAll(ctx, "reviews"),
      notifications: await deleteAll(ctx, "notifications"),
      messages: await deleteAll(ctx, "messages"),
      disputes: await deleteAll(ctx, "disputes"),
      codes: await deleteAll(ctx, "codes"),
      offers: await deleteAll(ctx, "offers"),
      shipments: await deleteAll(ctx, "shipments"),
      trips: await deleteAll(ctx, "trips"),
      uploads: await deleteAll(ctx, "uploads"),
      evidence: await deleteAll(ctx, "evidence"),
      audits: await deleteAll(ctx, "audits"),
      serviceAreaSettings: await deleteAll(ctx, "serviceAreaSettings"),
      authVerificationCodes: await deleteAll(ctx, "authVerificationCodes"),
      authRefreshTokens: await deleteAll(ctx, "authRefreshTokens"),
      authSessions: await deleteAll(ctx, "authSessions"),
      authAccounts: await deleteAll(ctx, "authAccounts"),
      authRateLimits: await deleteAll(ctx, "authRateLimits"),
      authVerifiers: await deleteAll(ctx, "authVerifiers"),
      users: await deleteAll(ctx, "users"),
      storageDeleted,
    };

    return {
      ...counts,
      totalDeleted: Object.values(counts).reduce((sum, count) => sum + count, 0),
    };
  },
});
