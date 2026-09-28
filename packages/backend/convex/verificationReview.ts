import { v } from "convex/values";
import { PERMISSIONS } from "@passenger/core";
import { query } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { effectiveTierName, isPhoneVerified, requireAdmin, requirePermission } from "./lib";
import { compareClaimedToText } from "./address";

// Purpose-built review payload for compliance staff (plan §22). Every field is
// derived server-side; reviewers never read raw submission documents directly.
async function submissionPayload(ctx: QueryCtx, submission: Doc<"verificationSubmissions">) {
  const user = submission.userId ? await ctx.db.get(submission.userId) : null;
  if (!user) return null;

  const evidence = async (ids: Id<"evidence">[] | undefined) => {
    const files = ids ?? [];
    return Promise.all(
      files.map(async id => {
        const file = await ctx.db.get(id);
        if (!file || file.ownerId !== user._id) {
          return { id, available: false as const };
        }
        return {
          id: file._id,
          available: true as const,
          filename: file.filename,
          contentType: file.contentType,
          size: file.size,
          createdAt: file.createdAt,
          url: await ctx.storage.getUrl(file.storageId),
        };
      }),
    );
  };

  const sessions = await ctx.db.query("addressVerificationSessions").withIndex("by_user", q => q.eq("userId", user._id)).collect();
  const submissions = await ctx.db.query("verificationSubmissions").withIndex("by_user", q => q.eq("userId", user._id)).take(50);
  const liveIdentityFile = submission.liveIdentityEvidenceId ? await ctx.db.get(submission.liveIdentityEvidenceId) : null;

  return {
    submission: {
      id: submission._id,
      version: submission.version,
      status: submission.status,
      submittedAt: submission.submittedAt,
      updatedAt: submission.updatedAt,
      reviewedAt: submission.reviewedAt,
      reviewedBy: submission.reviewedBy,
      reviewDecision: submission.reviewDecision,
      reviewNote: submission.reviewNote,
    },
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      phoneVerified: isPhoneVerified(user),
      currentTier: effectiveTierName(user) ?? null,
      accountAgeMs: Date.now() - user.joinedAt,
      previousVerificationAttempts: sessions.length,
    },
    identity: {
      legalName: submission.legalName,
      documentType: submission.identityDocumentType,
      documentNumber: submission.identityDocumentNumber,
      documentAddressText: submission.identityDocumentAddressText,
      evidence: await evidence(submission.identityEvidenceIds),
      faceComparison: {
        matchStatus: submission.faceMatchStatus ?? null,
        similarity: submission.faceMatchScore ?? null,
        matchedAt: submission.faceMatchedAt ?? null,
        potentialDuplicate: submission.facePotentialDuplicate ?? false,
        referenceImage: user.identityBioData?.imageBase64 ?? null,
        liveImage: liveIdentityFile && liveIdentityFile.ownerId === user._id && liveIdentityFile.kind === "verification_live_photo"
          ? {
              id: liveIdentityFile._id,
              filename: liveIdentityFile.filename,
              contentType: liveIdentityFile.contentType,
              size: liveIdentityFile.size,
              createdAt: liveIdentityFile.createdAt,
              url: await ctx.storage.getUrl(liveIdentityFile.storageId),
            }
          : null,
      },
    },
    claimedAddress: {
      raw: submission.claimedAddressRaw,
      normalized: submission.claimedAddress,
    },
    proofAddress: submission.claimedAddress && submission.proofAddressText
      ? {
          type: submission.proofOfAddressType,
          source: submission.proofAddressSource,
          text: submission.proofAddressText,
          evidence: await evidence(submission.proofAddressEvidenceIds),
          match: compareClaimedToText(submission.claimedAddress, submission.proofAddressText),
        }
      : null,
    liveLocation: submission.liveAddressResult
      ? {
          verifiedAt: submission.liveAddressResult.verifiedAt,
          accuracyMeters: submission.liveAddressResult.accuracyMeters,
          distanceMeters: submission.liveAddressResult.distanceMeters,
          latitude: submission.liveAddressResult.latitude,
          longitude: submission.liveAddressResult.longitude,
        }
      : null,
    security: submission.securityAssessment ?? null,
    previousSubmissionCount: submissions.length,
  };
}

export const getVerificationSubmissionForReview = query({
  args: { submissionId: v.id("verificationSubmissions") },
  handler: async (ctx, args) => {
    const reviewer = await requireAdmin(ctx);
    await requirePermission(ctx, reviewer, PERMISSIONS.COMPLIANCE_MANAGE);

    const submission = await ctx.db.get(args.submissionId);
    if (!submission) return null;
    return submissionPayload(ctx, submission);
  },
});

export const getVerificationSubmissionForUser = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const reviewer = await requireAdmin(ctx);
    await requirePermission(ctx, reviewer, PERMISSIONS.COMPLIANCE_MANAGE);

    const rows = await ctx.db
      .query("verificationSubmissions")
      .withIndex("by_user", q => q.eq("userId", args.userId))
      .order("desc")
      .take(1);
    const submission = rows[0];
    if (!submission) return null;
    return submissionPayload(ctx, submission);
  },
});

export const listPendingVerificationSubmissions = query({
  args: {},
  handler: async (ctx) => {
    const reviewer = await requireAdmin(ctx);
    await requirePermission(ctx, reviewer, PERMISSIONS.COMPLIANCE_MANAGE);

    const rows = await ctx.db.query("verificationSubmissions").withIndex("by_status", q => q.eq("status", "pending")).order("desc").take(50);
    return rows.map(submission => ({
      id: submission._id,
      version: submission.version,
      submittedAt: submission.submittedAt,
    }));
  },
});

// Complete verification history for compliance. Unlike the pending queue this
// keeps every submitted record (pending, verified and rejected) visible so a
// member's compliance trail is retained after review rather than disappearing.
export const listVerificationSubmissionsForReview = query({
  args: {},
  handler: async (ctx) => {
    const reviewer = await requireAdmin(ctx);
    await requirePermission(ctx, reviewer, PERMISSIONS.COMPLIANCE_MANAGE);

    const rows = await ctx.db.query("verificationSubmissions").withIndex("by_status").order("desc").take(100);
    const entries = await Promise.all(
      rows
        .filter(submission => submission.status !== "draft")
        .map(async submission => {
          const applicant = submission.userId ? await ctx.db.get(submission.userId) : null;
          const resolver = submission.reviewedBy ? await ctx.db.get(submission.reviewedBy) : null;
          return {
            id: submission._id,
            userId: submission.userId,
            userName: applicant?.name ?? "Deleted user",
            phone: applicant?.phone ?? null,
            email: applicant?.email ?? null,
            version: submission.version,
            status: submission.status,
            submittedAt: submission.submittedAt,
            updatedAt: submission.updatedAt,
            reviewedAt: submission.reviewedAt,
            reviewDecision: submission.reviewDecision,
            reviewerName: resolver?.name ?? null,
          };
        }),
    );
    return entries.sort((a, b) => (b.submittedAt ?? b.updatedAt) - (a.submittedAt ?? a.updatedAt));
  },
});

// Aggregated compliance health for the operations dashboard. Exact evidence,
// coordinates and document numbers are deliberately excluded from metrics.
export const getVerificationMetrics = query({
  args: {},
  handler: async ctx => {
    const reviewer = await requireAdmin(ctx);
    await requirePermission(ctx, reviewer, PERMISSIONS.COMPLIANCE_MANAGE);

    const now = Date.now();
    const dayAgo = now - 24 * 60 * 60 * 1000;
    const weekAgo = now - 7 * 24 * 60 * 60 * 1000;
    const [users, submissions, sessions, recentAudits] = await Promise.all([
      ctx.db.query("users").collect(),
      ctx.db.query("verificationSubmissions").collect(),
      ctx.db.query("addressVerificationSessions").collect(),
      ctx.db.query("audits").withIndex("by_created", q => q.gte("createdAt", weekAgo)).collect(),
    ]);

    const count = <T extends string>(values: T[], value: T) => values.filter(item => item === value).length;
    const submissionStates = submissions.map(item => item.status);
    const sessionStates = sessions.map(item => item.status);
    const securityDecisions = submissions.flatMap(item => item.securityAssessment ? [item.securityAssessment.decision] : []);
    const pending = submissions.filter(item => item.status === "pending" && item.submittedAt !== undefined);
    const completedReviews = submissions.filter(item => item.reviewedAt !== undefined && item.submittedAt !== undefined);
    const reviewDurations = completedReviews.map(item => Math.max(0, item.reviewedAt! - item.submittedAt!));

    return {
      generatedAt: now,
      tiers: {
        noTier: users.filter(user => user.kycTier === undefined).length,
        tier0: users.filter(user => user.kycTier === 0).length,
        tier1Plus: users.filter(user => (user.kycTier ?? -1) >= 1).length,
      },
      submissions: {
        draft: count(submissionStates, "draft"),
        pending: count(submissionStates, "pending"),
        verified: count(submissionStates, "verified"),
        rejected: count(submissionStates, "rejected"),
        oldestPendingAgeMs: pending.length ? now - Math.min(...pending.map(item => item.submittedAt!)) : null,
        reviewedLast7Days: completedReviews.filter(item => item.reviewedAt! >= weekAgo).length,
        averageReviewTimeMs: reviewDurations.length ? Math.round(reviewDurations.reduce((total, duration) => total + duration, 0) / reviewDurations.length) : null,
      },
      security: {
        pass: count(securityDecisions, "pass"),
        review: count(securityDecisions, "review"),
        highRisk: count(securityDecisions, "high_risk"),
      },
      location: {
        active: count(sessionStates, "active"),
        completed: count(sessionStates, "completed"),
        expired: count(sessionStates, "expired"),
        cancelled: count(sessionStates, "cancelled"),
        failedAttemptsLast24Hours: recentAudits.filter(event => event.createdAt >= dayAgo && event.action === "verification.address_session_failed").length,
      },
    };
  },
});
