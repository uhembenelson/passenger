import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { audit, fail, note, participant, requireUser, shipment } from "./lib";

export const list = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const [given, received] = await Promise.all([
      ctx.db.query("reviews").withIndex("by_author", q => q.eq("authorId", user._id)).collect(),
      ctx.db.query("reviews").withIndex("by_target", q => q.eq("targetId", user._id)).collect(),
    ]);
    const reviews = [...new Map([...given, ...received].map(review => [review._id, review])).values()];
    return reviews
      .filter(review => review.authorId === user._id || review.targetId === user._id)
      .map(review => ({
        id: review._id,
        shipmentId: review.shipmentId,
        authorId: review.authorId,
        targetId: review.targetId,
        rating: review.rating,
        comment: review.comment,
        createdAt: review.createdAt,
      }));
  },
});

export const create = mutation({
  args: {
    shipmentId: v.id("shipments"),
    rating: v.number(),
    comment: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const parcel = await shipment(ctx, args.shipmentId);

    if (!participant(parcel, user) || parcel.status !== "delivered" || !parcel.travellerId) {
      fail("Reviews require a completed delivery.");
    }
    if (!Number.isInteger(args.rating) || args.rating < 1 || args.rating > 5) {
      fail("Rating must be 1–5.");
    }

    const existingReviews = await ctx.db
      .query("reviews")
      .withIndex("by_shipment", q => q.eq("shipmentId", parcel._id))
      .collect();

    if (existingReviews.some(review => review.authorId === user._id)) {
      fail("You already reviewed this delivery.");
    }

    const targetId = user._id === parcel.senderId ? parcel.travellerId : parcel.senderId;
    if (targetId === user._id) fail("You cannot rate yourself.");
    const comment = note(args.comment ?? "", "Review", 0);

    const id = await ctx.db.insert("reviews", {
      shipmentId: parcel._id,
      authorId: user._id,
      targetId,
      rating: args.rating,
      comment,
      createdAt: Date.now(),
    });

    await audit(ctx, user, "review.created", `Delivery partner rated ${args.rating}/5.`, parcel._id);
    return id;
  },
});
