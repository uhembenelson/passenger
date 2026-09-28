import { beforeEach, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "../convex/schema";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { extractFaceDescriptor } from "../convex/faceModel";

vi.mock("../convex/faceModel", () => ({
  FACE_MODEL_VERSION: "face-api-1.7.15-tiny-128",
  extractFaceDescriptor: vi.fn(),
}));

const modules = import.meta.glob("../convex/**/*.ts");
const identity = { subject: "face-user", email: "face@example.com", issuer: "https://clerk.test", tokenIdentifier: "https://clerk.test|face-user" };

beforeEach(() => { vi.clearAllMocks(); });

async function setup() {
  const t = convexTest(schema, modules);
  const member = t.withIdentity(identity);
  const profile = await member.mutation(api.accounts.ensureProfile, { name: "Face User", phone: "+2348000000099" });
  const userId = profile.id as Id<"users">;
  await t.run(ctx => ctx.db.patch(userId, {
    identityNumberVerificationType: "BVN", identityNumberVerifiedAt: Date.now(),
    identityNumberProviderReference: "provider-123", identityBioData: { imageBase64: "aGVsbG8=" },
  }));
  const storageId = await t.run(ctx => ctx.storage.store(new Blob([new Uint8Array([1, 2, 3])], { type: "image/jpeg" })) as Promise<Id<"_storage">>);
  const evidenceId = await t.run(ctx => ctx.db.insert("evidence", {
    ownerId: userId, storageId, purpose: "identity", kind: "verification_live_photo",
    filename: "live.jpg", contentType: "image/jpeg", size: 3, createdAt: Date.now(),
  }));
  await member.mutation(api.tier1.saveTier1LiveIdentityPhoto, { evidenceId });
  return { t, member, userId, evidenceId };
}

it.each([true, false])("compares the live image with the provider image (match=%s)", async sameFace => {
  const { t, member, userId, evidenceId } = await setup();
  let calls = 0;
  vi.mocked(extractFaceDescriptor).mockImplementation(async () => {
    calls += 1;
    return Array.from({ length: 128 }, (_, index) => index === (sameFace || calls === 1 ? 0 : 1) ? 1 : 0);
  });
  const result = await member.action(api.facereg.processAndMatchFace, { evidenceId });
  expect(result.isMatch).toBe(sameFace);
  expect(result.confidence).toBe(sameFace ? 1 : 0);
  const submission = await t.run(async ctx => (await ctx.db.query("verificationSubmissions").withIndex("by_user", q => q.eq("userId", userId)).first())!);
  expect(submission.faceMatchStatus).toBe(sameFace ? "matched" : "mismatch");
  expect(submission.faceMatchEvidenceId).toBe(evidenceId);
  const faces = await t.run(ctx => ctx.db.query("faces").withIndex("by_user", q => q.eq("userId", userId)).collect());
  expect(faces).toHaveLength(sameFace ? 1 : 0);
});
