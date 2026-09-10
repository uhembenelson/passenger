import { v } from "convex/values";
import { mutation } from "./_generated/server";
import { fail, requireUser } from "./lib";

export const markRead = mutation({
  args: { notificationId: v.optional(v.id("notifications")) },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const now = Date.now();
    if (args.notificationId) {
      const notification = await ctx.db.get(args.notificationId);
      if (!notification || notification.userId !== user._id) fail("Notification not found.");
      if (!notification.readAt) await ctx.db.patch(notification._id, { readAt: now });
      return;
    }
    const notifications = await ctx.db.query("notifications").withIndex("by_user", q => q.eq("userId", user._id)).collect();
    for (const notification of notifications) if (!notification.readAt) await ctx.db.patch(notification._id, { readAt: now });
  },
});
