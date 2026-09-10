import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { requireUser, isAdmin, audit } from "./lib";

export const list = query({
  args: {},
  handler: async (ctx) => {
    return (await ctx.db.query("cancellationPolicies").withIndex("by_created").order("desc").collect()).map((p) => ({
      id: p._id,
      ruleName: p.ruleName,
      refundType: p.refundType,
      refundPercent: p.refundPercent,
      window: p.window,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    }));
  },
});

export const create = mutation({
  args: { ruleName: v.string(), refundType: v.string(), refundPercent: v.number(), window: v.string() },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    isAdmin(user);
    if (!args.ruleName.trim()) throw new Error("Rule name is required.");
    if (!args.refundType.trim()) throw new Error("Refund type is required.");
    if (args.refundPercent < 0 || args.refundPercent > 100) throw new Error("Refund percent must be between 0 and 100.");
    const now = Date.now();
    const id = await ctx.db.insert("cancellationPolicies", {
      ruleName: args.ruleName.trim(),
      refundType: args.refundType.trim(),
      refundPercent: args.refundPercent,
      window: args.window.trim(),
      createdAt: now,
      updatedAt: now,
    });
    await audit(ctx, user, "cancellation.created", `Created cancellation policy: ${args.ruleName}`);
    return id;
  },
});

export const update = mutation({
  args: { id: v.id("cancellationPolicies"), ruleName: v.string(), refundType: v.string(), refundPercent: v.number(), window: v.string() },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    isAdmin(user);
    const existing = await ctx.db.get(args.id);
    if (!existing) throw new Error("Cancellation policy not found.");
    if (!args.ruleName.trim()) throw new Error("Rule name is required.");
    if (args.refundPercent < 0 || args.refundPercent > 100) throw new Error("Refund percent must be between 0 and 100.");
    await ctx.db.patch(args.id, {
      ruleName: args.ruleName.trim(),
      refundType: args.refundType.trim(),
      refundPercent: args.refundPercent,
      window: args.window.trim(),
      updatedAt: Date.now(),
    });
    await audit(ctx, user, "cancellation.updated", `Updated cancellation policy: ${args.ruleName}`);
  },
});

export const remove = mutation({
  args: { id: v.id("cancellationPolicies") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    isAdmin(user);
    const existing = await ctx.db.get(args.id);
    if (!existing) throw new Error("Cancellation policy not found.");
    await ctx.db.delete(args.id);
    await audit(ctx, user, "cancellation.deleted", `Deleted cancellation policy: ${existing.ruleName}`);
  },
});