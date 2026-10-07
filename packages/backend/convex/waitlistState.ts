import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

export const reserve = internalMutation({
  args: { name: v.string(), email: v.string(), state: v.string() },
  handler: async (ctx, args): Promise<{ signupId: Id<"waitlistSignups">; shouldSend: boolean }> => {
    const now = Date.now();
    const existing = await ctx.db.query("waitlistSignups").withIndex("by_email", query => query.eq("email", args.email)).unique();
    if (existing) {
      const recentlyPending = existing.confirmationStatus === "pending"
        && typeof existing.lastConfirmationAttemptAt === "number"
        && now - existing.lastConfirmationAttemptAt < 60_000;
      await ctx.db.patch(existing._id, { name: args.name, state: args.state, updatedAt: now });
      if (existing.confirmationStatus === "sent" || recentlyPending) return { signupId: existing._id, shouldSend: false };
      await ctx.db.patch(existing._id, { confirmationStatus: "pending", lastConfirmationAttemptAt: now });
      return { signupId: existing._id, shouldSend: true };
    }
    const signupId = await ctx.db.insert("waitlistSignups", {
      ...args,
      confirmationStatus: "pending",
      lastConfirmationAttemptAt: now,
      createdAt: now,
      updatedAt: now,
    });
    return { signupId, shouldSend: true };
  },
});

export const recordConfirmation = internalMutation({
  args: {
    signupId: v.id("waitlistSignups"),
    status: v.union(v.literal("sent"), v.literal("failed")),
    emailId: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<void> => {
    await ctx.db.patch(args.signupId, {
      confirmationStatus: args.status,
      confirmationEmailId: args.emailId,
      updatedAt: Date.now(),
    });
  },
});
