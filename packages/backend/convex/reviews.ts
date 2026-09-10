import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { audit, fail, note, participant, requireUser, shipment } from "./lib";

export const list = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    const reviews = await ctx.db.query("reviews").collect();
    return reviews.filter(review => review.authorId === user._id || review.targetId === user._id).map(review => ({ id: review._id, shipmentId: review.shipmentId, authorId: review.authorId, targetId: review.targetId, rating: review.rating, comment: review.comment, createdAt: review.createdAt }));
  },
});

export const create = mutation({
  args: { shipmentId: v.id("shipments"), rating: v.number(), comment: v.string() },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx); const parcel = await shipment(ctx, args.shipmentId);
    if (!participant(parcel, user) || parcel.status !== "delivered" || !parcel.travellerId) fail("Reviews require a completed delivery.");
    if (!Number.isInteger(args.rating) || args.rating < 1 || args.rating > 5) fail("Rating must be 1–5.");
    const existing = (await ctx.db.query("reviews").withIndex("by_shipment", q => q.eq("shipmentId", parcel._id)).collect()).find(review => review.authorId === user._id);
    if (existing) fail("You already reviewed this delivery.");
    const targetId = user._id === parcel.senderId ? parcel.travellerId : parcel.senderId;
    const id = await ctx.db.insert("reviews", { shipmentId: parcel._id, authorId: user._id, targetId, rating: args.rating, comment: note(args.comment, "Review", 5), createdAt: Date.now() });
    await audit(ctx, user, "review.created", `Delivery partner rated ${args.rating}/5.`, parcel._id);
    return id;
  },
});
