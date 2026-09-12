import { v } from "convex/values";
import { query } from "./_generated/server";
import { personDto, requireUser } from "./lib";

export const publicProfile = query({
  args: {
    userId: v.id("users"),
    tripId: v.optional(v.id("trips")),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    const user = await ctx.db.get(args.userId);
    if (!user || user.suspended) return null;

    // Strict privacy: only public person fields
    const profile = await personDto(ctx, user, false);

    const takeLimit = Math.min(Math.max(1, args.limit ?? 10), 50);
    const reviews = await ctx.db
      .query("reviews")
      .withIndex("by_target", q => q.eq("targetId", args.userId))
      .order("desc")
      .take(takeLimit);

    let tripSummary = undefined;
    if (args.tripId) {
      const trip = await ctx.db.get(args.tripId);
      if (trip && trip.travellerId === user._id) {
        tripSummary = {
          id: trip._id,
          origin: trip.origin,
          destination: trip.destination,
          stops: trip.stops ?? [],
          departureAt: trip.departureAt,
          arrivalAt: trip.arrivalAt,
          capacityKg: trip.capacityKg,
          reservedKg: trip.reservedKg,
          acceptedCategories: trip.acceptedCategories ?? [],
          maxParcelWeightKg: trip.maxParcelWeightKg ?? trip.capacityKg,
          handlingNotes: trip.handlingNotes,
        };
      }
    }
    const previousTrips = (await ctx.db
      .query("trips")
      .withIndex("by_traveller", q => q.eq("travellerId", args.userId))
      .order("desc")
      .take(20))
      .filter(trip => trip._id !== args.tripId && (trip.status === "completed" || trip.departureAt < Date.now()))
      .slice(0, 3)
      .map(trip => ({ id: trip._id, origin: trip.origin, destination: trip.destination, departureAt: trip.departureAt }));

    return {
      id: profile.id,
      name: profile.name,
      image: profile.image,
      verification: profile.verification,
      joinedAt: profile.joinedAt,
      rating: profile.rating ?? 0,
      reviewCount: profile.reviewCount ?? 0,
      successfulDeliveries: profile.successfulDeliveries ?? 0,
      tripSummary,
      previousTrips,
      reviews: reviews.map(review => ({
        id: review._id,
        rating: review.rating,
        comment: review.comment,
        createdAt: review.createdAt,
      })),
    };
  },
});
