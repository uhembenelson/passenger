import { v } from "convex/values";
import { PERMISSIONS } from "@passenger/core";
import { mutation, query } from "./_generated/server";
import { audit, fail, requireAdmin, requirePermission, requireUser } from "./lib";

// Admin view over the public waitlist. Signups are created by the website's
// waitlist form (see waitlist.ts); the dashboard only reads and removes them,
// which is why this module exposes a query and a delete rather than a create.

const MAX_ROWS = 1000;

export const list = query({
  args: {},
  handler: async (ctx) => {
    const viewer = await requireUser(ctx);
    await requirePermission(ctx, viewer, PERMISSIONS.NOTIFICATIONS_VIEW);
    const signups = await ctx.db.query("waitlistSignups").collect();
    return signups
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, MAX_ROWS)
      .map(signup => ({
        id: signup._id,
        name: signup.name,
        email: signup.email,
        state: signup.state,
        confirmationStatus: signup.confirmationStatus,
        createdAt: signup.createdAt,
      }));
  },
});

export const remove = mutation({
  args: { id: v.id("waitlistSignups") },
  handler: async (ctx, args) => {
    const viewer = await requireAdmin(ctx);
    await requirePermission(ctx, viewer, PERMISSIONS.NOTIFICATIONS_MANAGE);
    const signup = await ctx.db.get(args.id);
    if (!signup) fail("That waitlist signup no longer exists.");
    await ctx.db.delete(args.id);
    await audit(ctx, viewer, "waitlist.signup.removed", `Removed ${signup.email} from the waitlist.`);
    return { ok: true };
  },
});
