import { v } from "convex/values";
import { PERMISSIONS } from "@passenger/core";
import { internalMutation, mutation } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { audit, requireAdmin, requirePermission } from "./lib";
import { internal } from "./_generated/api";

// Phase B — staged trust migration (plan §29).
//
// Rules:
//  - existing verified Tier 2/3 -> preserve tier (kycTier 2/3), identity verified
//  - existing verified Tier 1    -> preserve tier (kycTier 1), identity verified
//  - verified users with no explicit tier -> explicitly Tier 1 (kycTier 1),
//    NEVER Tier 2. Audited as migration.verification_explicit_tier1.
//  - pending/rejected users with a confirmed phone -> Tier 0 (kycTier 0),
//    identity state preserved
//  - unverified users with a confirmed phone -> Tier 0
//  - accounts without a confirmed phone -> keep no tier
//
// "Confirmed phone" = the existing canonical indicator `phoneVerificationTime`.
// A non-placeholder phone string is NOT proof of phone verification.

type LegacyTier = "Tier 1" | "Tier 2" | "Tier 3";

const LEGACY_TIER_TO_NUMERIC: Record<LegacyTier, 1 | 2 | 3> = {
  "Tier 1": 1,
  "Tier 2": 2,
  "Tier 3": 3,
};

type Target = {
  kycTier?: 0 | 1 | 2 | 3;
  identityVerificationStatus?: Doc<"users">["identityVerificationStatus"];
  phoneVerifiedAt?: number;
};

function classify(user: Doc<"users">): { group: string; target: Target } {
  const rawTier = user.tier as LegacyTier | undefined;
  const row: Target = {};

  if (user.phoneVerificationTime !== undefined) {
    row.phoneVerifiedAt = user.phoneVerificationTime;
  }

  if (user.verification === "verified") {
    if (rawTier && rawTier in LEGACY_TIER_TO_NUMERIC) {
      return {
        group: "preserve_legacy_tier",
        target: {
          ...row,
          kycTier: LEGACY_TIER_TO_NUMERIC[rawTier],
          identityVerificationStatus: "verified",
        },
      };
    }
    return {
      group: "verified_without_explicit_tier",
      target: {
        ...row,
        kycTier: 1,
        identityVerificationStatus: "verified",
      },
    };
  }

  if (user.phoneVerificationTime !== undefined) {
    if (user.verification === "pending" || user.verification === "rejected") {
      return {
        group: "pending_or_rejected_phone_verified",
        target: {
          ...row,
          kycTier: 0,
          identityVerificationStatus: user.verification,
        },
      };
    }
    return {
      group: "unverified_phone_verified",
      target: {
        ...row,
        kycTier: 0,
        identityVerificationStatus: "unverified",
      },
    };
  }

  return {
    group: "no_confirmed_phone",
    target: {
      ...row,
      identityVerificationStatus: "unverified",
    },
  };
}

type MigrateVerificationTiersArgs = {
  dryRun?: boolean;
  userId?: Id<"users">;
};

type MigrationReport = {
  dryRun: boolean;
  generatedAt: number;
  counts: Record<string, number>;
  totals: {
    alreadyMigrated: number;
    explicitTier1: number;
    noTarget: number;
    reviewed: number;
    changesApplied: number;
    changesReviewed: number;
  };
  changes: Array<{ userId: Id<"users">; group: string; kycTier: number | null; identity: string }>;
};

export const migrateVerificationTiers = mutation({
  args: {
    // Defaults to a dry-run report. Pass `dryRun: false` to apply.
    dryRun: v.optional(v.boolean()),
    // Optional single-user scope, useful after a partial apply.
    userId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    await requirePermission(ctx, admin, PERMISSIONS.COMPLIANCE_MANAGE);
    const report: MigrationReport = await ctx.runMutation(internal.verificationMigration.migrateVerificationTiersInternal, args satisfies MigrateVerificationTiersArgs);
    return report;
  },
});

// System entry point used by ops via `npx convex run` and by the gated public
// mutation above. Mirrors the established internalMutation pattern in
// maintenance.ts. Runs as the system, so the public wrapper remains the
// permissioned path for interactive users.
export const migrateVerificationTiersInternal = internalMutation({
  args: {
    dryRun: v.optional(v.boolean()),
    userId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    const dryRun = args.dryRun !== false;

    const users: Doc<"users">[] = [];
    if (args.userId) {
      const user = await ctx.db.get(args.userId);
      if (user) users.push(user);
    } else {
      const rows = await ctx.db.query("users").collect();
      users.push(...rows);
    }

    const report = await runMigration(ctx, dryRun, users);
    await audit(
      ctx,
      null,
      dryRun ? "migration.verification_dry_run" : "migration.verification_applied",
      `Staged-trust tier migration ${dryRun ? "dry run" : "applied"} (${report.changes.length} user change${report.changes.length === 1 ? "" : "s"}).`,
    );
    return report;
  },
});

async function runMigration(ctx: MutationCtx, dryRun: boolean, users: Doc<"users">[]) {
  const now = Date.now();
  const counts: Record<string, number> = {};
  let alreadyMigrated = 0;
  let explicitTier1 = 0;
  let noTarget = 0;
  const changes: Array<{ userId: Id<"users">; group: string; kycTier: number | null; identity: string }> = [];

  for (const user of users) {
    if (user.kycTier !== undefined) {
      alreadyMigrated += 1;
      const canonicalIdentity = user.identityVerificationStatus ?? (
        user.verification === "verified" || user.verification === "pending" || user.verification === "rejected"
          ? user.verification
          : "unverified"
      );
      const needsPhoneStamp = user.phoneVerificationTime !== undefined && user.phoneVerifiedAt === undefined;
      const needsIdentity = user.identityVerificationStatus === undefined;
      if (!needsPhoneStamp && !needsIdentity) {
        continue;
      }
      counts["already_tiered_backfill"] = (counts["already_tiered_backfill"] ?? 0) + 1;
      changes.push({ userId: user._id, group: "already_tiered_backfill", kycTier: user.kycTier, identity: canonicalIdentity });
      if (!dryRun) {
        await ctx.db.patch(user._id, {
          ...(needsPhoneStamp ? { phoneVerifiedAt: user.phoneVerificationTime } : {}),
          ...(needsIdentity ? { identityVerificationStatus: canonicalIdentity } : {}),
        });
      }
      continue;
    }

    const { group, target } = classify(user);
    counts[group] = (counts[group] ?? 0) + 1;

    const noOp = (target.kycTier === undefined || target.kycTier === user.kycTier)
      && (target.identityVerificationStatus === undefined || target.identityVerificationStatus === user.identityVerificationStatus)
      && (target.phoneVerifiedAt === undefined || target.phoneVerifiedAt === user.phoneVerifiedAt);
    if (noOp) {
      noTarget += 1;
      continue;
    }
    if (group === "verified_without_explicit_tier") explicitTier1 += 1;

    changes.push({
      userId: user._id,
      group,
      kycTier: target.kycTier ?? null,
      identity: target.identityVerificationStatus ?? "unverified",
    });

    if (!dryRun) {
      const patch: Target = {};
      if (target.kycTier !== undefined) patch.kycTier = target.kycTier;
      if (target.identityVerificationStatus !== undefined) patch.identityVerificationStatus = target.identityVerificationStatus;
      if (target.phoneVerifiedAt !== undefined) patch.phoneVerifiedAt = target.phoneVerifiedAt;
      await ctx.db.patch(user._id, patch);

      if (group === "verified_without_explicit_tier") {
        await audit(ctx, null, "migration.verification_explicit_tier1", "Tierless verified member set explicitly to Tier 1 during staged-trust migration.");
      }
    }
  }

  return {
    dryRun,
    generatedAt: now,
    counts,
    totals: {
      alreadyMigrated,
      explicitTier1: dryRun ? explicitTier1 : 0,
      noTarget,
      reviewed: users.length,
      changesApplied: dryRun ? 0 : changes.length,
      changesReviewed: changes.length,
    },
    changes: changes.slice(0, 1000),
  };
}
