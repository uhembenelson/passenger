import { v } from "convex/values";
import { PERMISSIONS } from "@passenger/core";
import { internalMutation, mutation, query } from "./_generated/server";
import { fail, requireAdmin, requirePermission, requireUser } from "./lib";

// Opt-out handling for broadcast emails. Broadcasts carry a personal
// unsubscribe link; clicking it marks the address in emailContacts as
// opted out and future broadcasts skip it. Transactional messages are
// unaffected. Tiers and lists resolve through the same suppression set.

// Mark an address as opted out from a personal unsubscribe link. Public entry
// point for the HTTP route, so the viewer is the token, not an admin session.
export const unsubscribeByToken = internalMutation({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const contact = await ctx.db.query("emailContacts").withIndex("by_token", q => q.eq("token", args.token)).first();
    if (!contact) return { ok: false };
    const already = contact.unsubscribedAt !== undefined;
    if (!already) {
      await ctx.db.patch(contact._id, { unsubscribedAt: Date.now(), unsubscribeSource: "unsubscribe_link" });
    }
    return { ok: true, email: contact.email, already };
  },
});

// Addresses that have opted out of broadcasts, newest first. Used by the
// admin dashboard to review and reverse opt-outs.
export const suppressed = query({
  args: {},
  handler: async ctx => {
    const viewer = await requireUser(ctx);
    await requirePermission(ctx, viewer, PERMISSIONS.NOTIFICATIONS_VIEW);
    const contacts = await ctx.db.query("emailContacts").collect();
    return contacts
      .filter(contact => contact.unsubscribedAt !== undefined)
      .map(contact => ({ email: contact.email, unsubscribedAt: contact.unsubscribedAt as number }))
      .sort((a, b) => b.unsubscribedAt - a.unsubscribedAt);
  },
});

// Allow the address to receive broadcasts again.
export const restoreEmail = mutation({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    const viewer = await requireAdmin(ctx);
    await requirePermission(ctx, viewer, PERMISSIONS.NOTIFICATIONS_MANAGE);
    const email = args.email.trim().toLowerCase();
    if (!email) fail("Enter an email address.");
    const contact = await ctx.db.query("emailContacts").withIndex("by_email", q => q.eq("email", email)).first();
    if (!contact || contact.unsubscribedAt === undefined) fail("This address is not on the suppressed list.");
    await ctx.db.patch(contact._id, { unsubscribedAt: undefined, unsubscribeSource: undefined });
  },
});