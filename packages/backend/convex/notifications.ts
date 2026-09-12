import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { mutation, query } from "./_generated/server";
import { fail, participant, requireUser, shipmentDto } from "./lib";

export const listPage = query({
  args: { paginationOpts: paginationOptsValidator, unreadOnly: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const source = args.unreadOnly
      ? ctx.db.query("notifications").withIndex("by_user_read", q => q.eq("userId", user._id).eq("readAt", undefined))
      : ctx.db.query("notifications").withIndex("by_user", q => q.eq("userId", user._id));
    const result = await source
      .order("desc")
      .paginate(args.paginationOpts);

    return {
      ...result,
      page: result.page.map(notification => ({
        id: notification._id,
        title: notification.title,
        body: notification.body,
        shipmentId: notification.shipmentId,
        createdAt: notification.createdAt,
        readAt: notification.readAt,
      })),
    };
  },
});

export const unreadCount = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const notifications = await ctx.db
      .query("notifications")
      .withIndex("by_user_read", q => q.eq("userId", user._id).eq("readAt", undefined))
      .collect();
    return notifications.length;
  },
});

export const markRead = mutation({
  args: { notificationId: v.optional(v.id("notifications")) },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const now = Date.now();

    if (args.notificationId) {
      const notification = await ctx.db.get(args.notificationId);
      if (!notification || notification.userId !== user._id) {
        fail("Notification not found.");
      }
      if (!notification.readAt) {
        await ctx.db.patch(notification._id, { readAt: now });
      }
      return;
    }

    const notifications = await ctx.db
      .query("notifications")
      .withIndex("by_user_read", q => q.eq("userId", user._id).eq("readAt", undefined))
      .collect();

    for (const notification of notifications) {
      if (!notification.readAt) {
        await ctx.db.patch(notification._id, { readAt: now });
      }
    }
  },
});

// Resolve older notification links independently of the bounded dashboard feed.
export const delivery = query({
  args: { shipmentId: v.id("shipments") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const parcel = await ctx.db.get(args.shipmentId);
    if (!parcel || !participant(parcel, user)) return null;
    return shipmentDto(ctx, parcel, true);
  },
});
