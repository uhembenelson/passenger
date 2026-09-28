"use node";

import { v } from "convex/values";
import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import { extractFaceDescriptor, FACE_MODEL_VERSION } from "./faceModel";

const MATCH_THRESHOLD = 0.8;

function referenceBytes(value: string): Buffer {
  const base64 = value.replace(/^data:image\/(?:jpeg|png);base64,/i, "");
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(base64) || base64.length > 14_000_000) {
    throw new Error("The BVN/NIN reference photo is invalid. Contact support.");
  }
  return Buffer.from(base64, "base64");
}

export const processAndMatchFace = action({
  args: { evidenceId: v.id("evidence") },
  handler: async (ctx, args): Promise<{ isMatch: boolean; confidence: number; needsReview: boolean }> => {
    const input = await ctx.runQuery(internal.engine.getMatchInputs, args);
    if (input.contentType !== "image/jpeg" && input.contentType !== "image/png") {
      throw new Error("Capture a JPEG or PNG live photo.");
    }
    const liveBlob = await ctx.storage.get(input.storageId);
    if (!liveBlob) throw new Error("Live photo not found. Please capture it again.");
    const reference = await extractFaceDescriptor(referenceBytes(input.referenceImage));
    const live = await extractFaceDescriptor(Buffer.from(await liveBlob.arrayBuffer()));
    const score = reference.reduce((sum, value, index) => sum + value * live[index]!, 0);
    const nearest = await ctx.vectorSearch("faces", "by_face_embedding", {
      vector: live,
      limit: 5,
      filter: q => q.eq("modelVersion", FACE_MODEL_VERSION),
    });
    let potentialDuplicate = false;
    for (const candidate of nearest) {
      if (candidate._score < MATCH_THRESHOLD) continue;
      const owner = await ctx.runQuery(internal.engine.getIndexedFaceOwner, { faceId: candidate._id });
      if (owner && owner.userId !== input.userId) potentialDuplicate = true;
    }
    return ctx.runMutation(internal.engine.storeMatchResult, {
      userId: input.userId,
      submissionId: input.submissionId,
      evidenceId: args.evidenceId,
      providerIdentityId: input.providerIdentityId,
      referenceEmbedding: reference,
      modelVersion: FACE_MODEL_VERSION,
      score,
      potentialDuplicate,
    });
  },
});
