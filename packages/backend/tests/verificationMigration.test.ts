/// <reference types="vite/client" />
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "../convex/schema";
import { api } from "../convex/_generated/api";
import type { Doc, Id } from "../convex/_generated/dataModel";

const modules = import.meta.glob("../convex/**/*.ts");
const identity = (subject: string) => ({ subject, issuer: "https://clerk.test", tokenIdentifier: `https://clerk.test|${subject}` });

beforeEach(() => {
  vi.stubEnv("ADMIN_CLERK_SUBJECTS", "admin");
});
afterEach(() => { vi.unstubAllEnvs(); });

async function fixture() {
  const t = convexTest(schema, modules);
  const admin = t.withIdentity(identity("admin"));
  await admin.mutation(api.accounts.ensureProfile, { name: "Admin", phone: "+2348000000001" });
  const insert = (subject: string, patch: Record<string, unknown>) =>
    t.run(ctx => ctx.db.insert("users", {
      subject,
      name: "Member",
      phone: "+2348000000002",
      verification: "required",
      joinedAt: Date.now(),
      ...patch,
    }));
  const userBySubject = async (subject: string): Promise<Doc<"users"> | null> =>
    t.run(ctx => ctx.db.query("users").withIndex("by_subject", q => q.eq("subject", subject)).unique());
  return { t, admin, insert, userBySubject };
}

test("dry run reports legacy verified Tier 2/3 users without writing", async () => {
  const f = await fixture();
  await f.insert("t2", { verification: "verified", tier: "Tier 2", phoneVerificationTime: Date.now() });
  await f.insert("t3", { verification: "verified", tier: "Tier 3", phoneVerificationTime: Date.now() });

  const report = await f.admin.mutation(api.verificationMigration.migrateVerificationTiers, {});
  expect(report.dryRun).toBe(true);
  expect(report.counts.preserve_legacy_tier).toBe(2);
  const untouched = await f.userBySubject("t2");
  expect(untouched?.kycTier).toBeUndefined();
});

test("tierless verified users become explicit Tier 1, never Tier 2", async () => {
  const f = await fixture();
  await f.insert("tv", { verification: "verified", phoneVerificationTime: Date.now() });

  const report = await f.admin.mutation(api.verificationMigration.migrateVerificationTiers, { dryRun: false });
  const changed = report.changes.filter((c: { kycTier: number | null }) => c.kycTier === 1);
  expect(changed).toHaveLength(1);

  const user = await f.userBySubject("tv");
  expect(user?.kycTier).toBe(1);
  expect(user?.identityVerificationStatus).toBe("verified");
  expect(user?.phoneVerifiedAt).toBeTypeOf("number");
});

test("pending/rejected users with a confirmed phone stay Tier 0 with identity state preserved", async () => {
  const f = await fixture();
  await f.insert("pe", { verification: "pending", phoneVerificationTime: Date.now() });
  await f.insert("re", { verification: "rejected", phoneVerificationTime: Date.now() });

  await f.admin.mutation(api.verificationMigration.migrateVerificationTiers, { dryRun: false });

  const pending = await f.userBySubject("pe");
  expect(pending?.kycTier).toBe(0);
  expect(pending?.identityVerificationStatus).toBe("pending");

  const rejected = await f.userBySubject("re");
  expect(rejected?.kycTier).toBe(0);
  expect(rejected?.identityVerificationStatus).toBe("rejected");
});

test("no confirmed phone keeps no tier; unverified with confirmed phone becomes Tier 0", async () => {
  const f = await fixture();
  await f.insert("nophone", { verification: "required" });
  await f.insert("withphone", { verification: "required", phoneVerificationTime: Date.now() });

  await f.admin.mutation(api.verificationMigration.migrateVerificationTiers, { dryRun: false });

  const noPhone = await f.userBySubject("nophone");
  expect(noPhone?.kycTier).toBeUndefined();

  const withPhone = await f.userBySubject("withphone");
  expect(withPhone?.kycTier).toBe(0);
  expect(withPhone?.identityVerificationStatus).toBe("unverified");
});

test("already migrated users are skipped and a phone stamp can be backfilled", async () => {
  const f = await fixture();
  const migratedId = await f.insert("mig", { kycTier: 1, identityVerificationStatus: "verified", phoneVerificationTime: Date.now() }) as Id<"users">;

  const report = await f.admin.mutation(api.verificationMigration.migrateVerificationTiers, { dryRun: false });
  expect(report.totals.alreadyMigrated).toBeGreaterThanOrEqual(1);

  const user = await f.t.run(ctx => ctx.db.get(migratedId));
  expect(user?.phoneVerifiedAt).toBeTypeOf("number");
});

test("dry run never backfills an already-tiered user's phone timestamp", async () => {
  const f = await fixture();
  const migratedId = await f.insert("dry-mig", { kycTier: 1, identityVerificationStatus: "verified", phoneVerificationTime: Date.now() }) as Id<"users">;

  const report = await f.admin.mutation(api.verificationMigration.migrateVerificationTiers, { dryRun: true });
  expect(report.dryRun).toBe(true);
  expect((await f.t.run(ctx => ctx.db.get(migratedId)))?.phoneVerifiedAt).toBeUndefined();
});

test("applied migration is idempotent on the next dry run", async () => {
  const f = await fixture();
  await f.insert("repeat", { verification: "required" });

  await f.admin.mutation(api.verificationMigration.migrateVerificationTiers, { dryRun: false });
  const next = await f.admin.mutation(api.verificationMigration.migrateVerificationTiers, { dryRun: true });
  expect(next.changes).toEqual([]);
  expect(next.totals.changesReviewed).toBe(0);
});
