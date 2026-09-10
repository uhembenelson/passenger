import { v } from "convex/values";
import { query } from "./_generated/server";
import { personDto, requireUser } from "./lib";

export const publicProfile = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    const user = await ctx.db.get(args.userId);
    if (!user || user.suspended) return null;
    const profile = await personDto(ctx, user, false);
    const reviews = await ctx.db.query("reviews").withIndex("by_target", query => query.eq("targetId", args.userId)).order("desc").take(10);
    return {
      id: profile.id,
      name: profile.name,
      verification: profile.verification,
      joinedAt: profile.joinedAt,
      rating: profile.rating ?? 0,
      reviewCount: profile.reviewCount ?? 0,
      successfulDeliveries: profile.successfulDeliveries ?? 0,
      reviews: reviews.map(review => ({ id: review._id, rating: review.rating, comment: review.comment, createdAt: review.createdAt })),
    };
  },
});
