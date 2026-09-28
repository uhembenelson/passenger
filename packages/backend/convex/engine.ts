import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import { fail, isIdentityNumberVerified, requireActive, requireUser } from "./lib";

const DIMENSIONS = 128;
const MATCH_THRESHOLD = 0.8;

export const getMatchInputs = internalQuery({
  args: { evidenceId: v.id("evidence") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    requireActive(user);
    if (!isIdentityNumberVerified(user) || !user.identityBioData?.imageBase64 || !user.identityNumberProviderReference) {
      fail("Verify your BVN or NIN before checking your face.");
    }
    const evidence = await ctx.db.get(args.evidenceId);
    if (!evidence || evidence.ownerId !== user._id || evidence.kind !== "verification_live_photo" || evidence.purpose !== "identity") {
      fail("Take a new live photo with the front camera.");
    }
    const submission = evidence.verificationSubmissionId ? await ctx.db.get(evidence.verificationSubmissionId) : null;
    if (!submission || submission.userId !== user._id || submission.status !== "draft" || submission.liveIdentityEvidenceId !== evidence._id) {
      fail("Save your live photo before checking your face.");
    }
    return {
      userId: user._id,
      submissionId: submission._id,
      storageId: evidence.storageId,
      contentType: evidence.contentType,
      providerIdentityId: user.identityNumberProviderReference,
      referenceImage: user.identityBioData.imageBase64,
    };
  },
});

export const getIndexedFaceOwner = internalQuery({
  args: { faceId: v.id("faces") },
  handler: async (ctx, args) => {
    const face = await ctx.db.get(args.faceId);
    return face ? { userId: face.userId, providerIdentityId: face.providerIdentityId } : null;
  },
});

export const storeMatchResult = internalMutation({
  args: {
    userId: v.id("users"), submissionId: v.id("verificationSubmissions"), evidenceId: v.id("evidence"),
    providerIdentityId: v.string(), referenceEmbedding: v.array(v.number()),
    modelVersion: v.string(),
    score: v.number(), potentialDuplicate: v.boolean(),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    const submission = await ctx.db.get(args.submissionId);
    if (!user || !submission || submission.userId !== user._id || submission.status !== "draft" ||
        submission.liveIdentityEvidenceId !== args.evidenceId || user.identityNumberProviderReference !== args.providerIdentityId) {
      fail("Your verification changed. Please try again.");
    }
    if (args.referenceEmbedding.length !== DIMENSIONS || !args.referenceEmbedding.every(Number.isFinite) || !Number.isFinite(args.score)) fail("Face embedding is invalid.");
    const matched = args.score >= MATCH_THRESHOLD;
    const existing = await ctx.db.query("faces").withIndex("by_user", q => q.eq("userId", user._id)).collect();
    for (const face of existing) await ctx.db.delete(face._id);
    if (matched) {
      await ctx.db.insert("faces", { userId: user._id, providerIdentityId: args.providerIdentityId, modelVersion: args.modelVersion, embedding: args.referenceEmbedding, createdAt: Date.now() });
    }
    await ctx.db.patch(submission._id, {
      faceMatchStatus: matched ? "matched" : "mismatch",
      faceMatchScore: args.score,
      faceMatchEvidenceId: args.evidenceId,
      faceMatchProviderIdentityId: args.providerIdentityId,
      faceMatchedAt: Date.now(),
      facePotentialDuplicate: args.potentialDuplicate,
      updatedAt: Date.now(),
    });
    await ctx.db.patch(user._id, { identityFaceVerificationStatus: matched ? "pending" : "rejected" });
    return { isMatch: matched, confidence: args.score, needsReview: args.potentialDuplicate };
  },
});
