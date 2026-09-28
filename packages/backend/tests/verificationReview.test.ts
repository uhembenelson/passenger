import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "../convex/schema";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
const modules = import.meta.glob("../convex/**/*.ts");
const identity = (subject: string) => ({ subject, issuer: "https://clerk.test", tokenIdentifier: `https://clerk.test|${subject}`, email: `${subject}@example.com` });

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubEnv("ADMIN_CLERK_SUBJECTS", "admin");
  vi.stubEnv("PAYSTACK_SECRET_KEY", "sk_test_backend_only");
  vi.stubEnv("TERMII_API_KEY", "AC123456789");
  vi.stubEnv("TERMII_SENDER_ID", "Passenger");
  vi.stubEnv("TERMII_BASE_URL", "https://api.ng.termii.com");
  vi.stubEnv("TERMII_CHANNEL", "generic");
  vi.unstubAllGlobals();
});
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });

async function fixture() {
  const t = convexTest(schema, modules);
  const admin = t.withIdentity(identity("admin"));
  const member = t.withIdentity(identity("member"));
  const stranger = t.withIdentity(identity("stranger"));
  const a = await admin.mutation(api.accounts.ensureProfile, { name: "Admin", phone: "+2348000000007" });
  const s = await member.mutation(api.accounts.ensureProfile, { name: "Member", phone: "+2348000000005" });
  const o = await stranger.mutation(api.accounts.ensureProfile, { name: "Stranger", phone: "+2348000000006" });
  await t.run(ctx => ctx.db.patch(s.id as Id<"users">, { kycTier: 0, phoneVerifiedAt: Date.now(), phoneVerificationTime: Date.now() }));
  const userId = s.id as Id<"users">;
  const submissionId = await t.run(async ctx => ctx.db.insert("verificationSubmissions", {
    userId,
    type: "tier_1",
    status: "pending",
    version: 2,
    legalName: { firstName: "Tunde", lastName: "Oyinlola" },
    identityDocumentType: "drivers_license",
    identityDocumentNumber: "DLK-42012",
    identityEvidenceIds: [] as never[],
    claimedAddress: { street: "12 Test Crescent", city: "Ikeja", state: "Lagos", country: "NG", houseNumberOrName: "12", postalCode: "100271" },
    claimedAddressRaw: "12 Test Crescent, Ikeja, Lagos",
    proofOfAddressType: "utility_bill",
    proofAddressText: "Electricity bill to 12 Test Crescent, Ikeja, Lagos.",
    proofAddressSource: "user_entered",
    proofAddressEvidenceIds: [] as never[],
    securityAssessment: {
      version: "v1",
      score: 88,
      decision: "pass",
      signals: {
        geoMatch: { score: 90, distanceMeters: 250, accuracyMeters: 50, status: "strong" },
        proofAddressMatch: { score: 92, status: "strong", matchedComponents: ["street", "city", "state"], mismatchedComponents: [] },
        identityAddressMatch: { score: 85, status: "strong" },
        deviceIntegrity: { score: 96, flags: [] },
      },
      flags: [],
    },
    submittedAt: Date.now(),
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }));
  return { t, admin, member, stranger, userId, adminId: a.id as Id<"users">, submissionId, memberId: userId, strangerId: o.id as Id<"users"> };
}

describe("Phase F — admin compliance review of verification submissions", () => {
  it("exposes privacy-safe compliance metrics only to authorised reviewers", async () => {
    const { admin, member } = await fixture();
    const metrics = await admin.query(api.verificationReview.getVerificationMetrics, {});
    expect(metrics.submissions.pending).toBe(1);
    expect(metrics.security.pass).toBe(1);
    expect(metrics).not.toHaveProperty("coordinates");
    await expect(member.query(api.verificationReview.getVerificationMetrics, {})).rejects.toThrow(/admin|permission|administrator/i);
  });

  it("getVerificationSubmissionForReview is compliance-gated", async () => {
    const { t, admin, member, stranger, submissionId /*, userId */ } = await fixture();
    await t.withIdentity(identity("admin")).query?.(api.verificationReview.getVerificationSubmissionForReview, { submissionId: submissionId as Id<"verificationSubmissions"> });
    void admin;
    await expect(
      member.query(api.verificationReview.getVerificationSubmissionForReview, { submissionId: submissionId as Id<"verificationSubmissions"> }),
    ).rejects.toThrow(/admin|permission|administrator/i);
    await expect(
      stranger.query(api.verificationReview.getVerificationSubmissionForReview, { submissionId: submissionId as Id<"verificationSubmissions"> }),
    ).rejects.toThrow(/admin|permission|administrator/i);
  });

  it("reviewVerificationSubmission approves a pending submission end to end", async () => {
    const { t, admin, member, adminId, submissionId, userId } = await fixture();
    await admin.mutation(api.admin.reviewVerificationSubmission, { submissionId, decision: "verified", note: "Live check + documents consistent." });
    const submission = await t.run(ctx => ctx.db.get(submissionId));
    expect(submission?.status).toBe("verified");
    const user = await t.run(ctx => ctx.db.get(userId));
    expect(user?.identityVerificationStatus).toBe("verified");
    expect((user as { kycTier?: number })?.kycTier ?? 0).toBeGreaterThanOrEqual(1);
    expect((user as { identityVerifiedAt?: number })?.identityVerifiedAt).toBeTruthy();
    const audit = await t.run(ctx => ctx.db.query("audits").order("desc").first());
    void member; void submission;
    expect(audit?.action).toMatch(/verification\.(approved)/);
  });

  it("reviewVerificationSubmission rejects and resets tier", async () => {
    const { t, admin, submissionId, userId } = await fixture();
    await t.run(ctx => ctx.db.patch(submissionId, { status: "pending" }));
    await admin.mutation(api.admin.reviewVerificationSubmission, { submissionId, decision: "rejected", note: "Address evidence unmatchable." });
    const submission = await t.run(ctx => ctx.db.get(submissionId));
    expect(submission?.status).toBe("rejected");
    const user = await t.run(ctx => ctx.db.get(userId));
    expect((user as { identityVerificationStatus?: string })?.identityVerificationStatus).toBe("rejected");
    expect((user as { kycTier?: number })?.kycTier ?? 0).toBe(0);
  });

  it("requires a meaningful explanation before recording a review decision", async () => {
    const { admin, submissionId } = await fixture();
    await expect(
      admin.mutation(api.admin.reviewVerificationSubmission, { submissionId, decision: "verified", note: "   " }),
    ).rejects.toThrow(/explanation/i);
    await expect(
      admin.mutation(api.admin.reviewVerificationSubmission, { submissionId, decision: "rejected", note: "no" }),
    ).rejects.toThrow(/explanation/i);
  });

  it("reviewing a non-pending submission fails", async () => {
    const { t, admin, submissionId } = await fixture();
    await t.run(ctx => ctx.db.patch(submissionId, { status: "verified" }));
    await expect(
      admin.mutation(api.admin.reviewVerificationSubmission, { submissionId, decision: "verified", note: "Already reviewed." }),
    ).rejects.toThrow();
  });
});
