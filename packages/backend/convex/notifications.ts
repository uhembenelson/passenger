import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { mutation, query } from "./_generated/server";
import { fail, requireUser } from "./lib";

export const listPage = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const result = await ctx.db
      .query("notifications")
      .withIndex("by_user", q => q.eq("userId", user._id))
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
    const unread = await ctx.db
      .query("notifications")
      .withIndex("by_user_read", q => q.eq("userId", user._id).eq("readAt", undefined))
      .collect();
    return unread.length;
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
      await ctx.db.patch(notification._id, { readAt: now });
    }
  },
});
