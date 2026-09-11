import { v } from "convex/values";
import { PERMISSIONS } from "@passenger/core";
import { query, mutation } from "./_generated/server";
import { requireUser, requirePermission, audit } from "./lib";

export const list = query({
  args: {},
  handler: async (ctx) => {
    return (await ctx.db.query("escrowPolicies").withIndex("by_created").order("desc").collect()).map((p) => ({
      id: p._id,
      policyName: p.policyName,
      type: p.type,
      releaseTime: p.releaseTime,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    }));
  },
});

export const create = mutation({
  args: { policyName: v.string(), type: v.string(), releaseTime: v.string() },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    await requirePermission(ctx, user, PERMISSIONS.SETTINGS_MANAGE);
    if (!args.policyName.trim()) throw new Error("Policy name is required.");
    if (!args.type.trim()) throw new Error("Policy type is required.");
    const now = Date.now();
    const id = await ctx.db.insert("escrowPolicies", {
      policyName: args.policyName.trim(),
      type: args.type.trim(),
      releaseTime: args.releaseTime.trim() || "--",
      createdAt: now,
      updatedAt: now,
    });
    await audit(ctx, user, "escrow.created", `Created escrow policy: ${args.policyName}`);
    return id;
  },
});

export const update = mutation({
  args: { id: v.id("escrowPolicies"), policyName: v.string(), type: v.string(), releaseTime: v.string() },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    await requirePermission(ctx, user, PERMISSIONS.SETTINGS_MANAGE);
    const existing = await ctx.db.get(args.id);
    if (!existing) throw new Error("Escrow policy not found.");
    if (!args.policyName.trim()) throw new Error("Policy name is required.");
    await ctx.db.patch(args.id, {
      policyName: args.policyName.trim(),
      type: args.type.trim(),
      releaseTime: args.releaseTime.trim() || "--",
      updatedAt: Date.now(),
    });
    await audit(ctx, user, "escrow.updated", `Updated escrow policy: ${args.policyName}`);
  },
});

export const remove = mutation({
  args: { id: v.id("escrowPolicies") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    await requirePermission(ctx, user, PERMISSIONS.SETTINGS_MANAGE);
    const existing = await ctx.db.get(args.id);
    if (!existing) throw new Error("Escrow policy not found.");
    await ctx.db.delete(args.id);
    await audit(ctx, user, "escrow.deleted", `Deleted escrow policy: ${existing.policyName}`);
  },
});
