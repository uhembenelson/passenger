import { v } from "convex/values";
import { mutation } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import {
  audit,
  fail,
  getTierLimits,
  note,
  notify,
  notifyParticipants,
  releaseCapacity,
  requireUser,
  requireVerified,
  safeValidateTrip,
} from "./lib";
import { assertSupportedRoute } from "./serviceArea";
import { refundForShipment } from "./wallet";

export const tripArgs = {
  origin: v.string(),
  destination: v.string(),
  stops: v.array(v.string()),
  departureAt: v.number(),
  arrivalAt: v.number(),
  capacityKg: v.number(),
  acceptedCategories: v.optional(v.array(v.string())),
  maxParcelWeightKg: v.optional(v.number()),
  handlingNotes: v.optional(v.string()),
};

export const createDefinition = {
  args: tripArgs,
  handler: async (ctx: MutationCtx, args: any) => {
    const user = await requireUser(ctx);
    requireVerified(user);

    await assertSupportedRoute(ctx, args.origin, args.destination);
    safeValidateTrip(args);

    const limits = await getTierLimits(ctx, user);
    if (args.capacityKg > limits.maxCapacityKg) {
      fail(`Your ${limits.tier} allows carrying at most ${limits.maxCapacityKg} kg per trip. Request a tier upgrade after verification.`);
    }

    const id = await ctx.db.insert("trips", {
      ...args,
      origin: args.origin.trim(),
      destination: args.destination.trim(),
      stops: args.stops.map((s: string) => s.trim()),
      acceptedCategories: args.acceptedCategories ?? [],
      handlingNotes: args.handlingNotes?.trim(),
      travellerId: user._id,
      reservedKg: 0,
      status: "active",
    });

    await audit(ctx, user, "trip.created", `Trip published: ${id}.`);
    return id;
  },
};

export const create = mutation(createDefinition);

export const update = mutation({
  args: {
    tripId: v.id("trips"),
    ...tripArgs,
  },
  handler: async (ctx, { tripId, ...args }) => {
    const user = await requireUser(ctx);
    requireVerified(user);

    const existingTrip = await ctx.db.get(tripId);
    if (!existingTrip || existingTrip.travellerId !== user._id) {
      fail("Your trip was not found.");
    }
    if (
      existingTrip.status === "cancelled" ||
      existingTrip.status === "completed" ||
      existingTrip.departureAt <= Date.now()
    ) {
      fail("Only active future trips may be edited.");
    }

    const bookings = await ctx.db
      .query("shipments")
      .withIndex("by_trip", q => q.eq("tripId", tripId))
      .collect();

    if (
      bookings.some(
        s => s.reservationActive || !["cancelled", "open", "rejected"].includes(s.status),
      )
    ) {
      fail("Route and carrying preferences cannot change after booking commitments.");
    }

    await assertSupportedRoute(ctx, args.origin, args.destination);
    safeValidateTrip(args);

    const limits = await getTierLimits(ctx, user);
    if (args.capacityKg > limits.maxCapacityKg) {
      fail(`Your ${limits.tier} allows carrying at most ${limits.maxCapacityKg} kg per trip. Request a tier upgrade after verification.`);
    }

    // Withdraw existing pending offers and notify senders
    const offers = await ctx.db
      .query("offers")
      .withIndex("by_trip", q => q.eq("tripId", tripId))
      .collect();

    for (const offer of offers) {
      if (offer.status === "pending") {
        await ctx.db.patch(offer._id, { status: "withdrawn" });
        const parcel = await ctx.db.get(offer.shipmentId);
        if (parcel) {
          await notify(
            ctx,
            parcel.senderId,
            "Offer withdrawn",
            "The traveller updated their trip details and their carry offer was withdrawn.",
            parcel._id,
          );
        }
      }
    }

    await ctx.db.patch(tripId, {
      ...args,
      origin: args.origin.trim(),
      destination: args.destination.trim(),
      stops: args.stops.map(s => s.trim()),
      acceptedCategories: args.acceptedCategories ?? [],
      handlingNotes: args.handlingNotes?.trim(),
    });

    await audit(ctx, user, "trip.updated", "Trip edited; previous pending offers withdrawn.");
  },
});

export async function cancelBooking(
  ctx: MutationCtx,
  s: Doc<"shipments">,
  reason: string,
  actor: Doc<"users"> | null,
) {
  if (["cancelled", "delivered"].includes(s.status)) return;
  if (s.status === "disputed") {
    fail("Resolve the linked open dispute before cancelling this trip.");
  }
  if (s.status === "in_transit") {
    fail("A parcel is already in transit; open a dispute for support.");
  }
  if (["released", "refunded", "refund_pending", "payout_pending", "payout_failed"].includes(s.paymentStatus)) {
    fail("A finance operation requires review before cancellation.");
  }

  const funded = ["held", "reconciliation_required"].includes(s.paymentStatus);
  if (s.paymentStatus === "held") {
    const sender = await ctx.db.get(s.senderId);
    if (sender) {
      await refundForShipment(ctx, sender, s._id, s.feeNaira, `Trip cancelled: ${reason}`);
    }
  }

  await ctx.db.patch(s._id, {
    status: "cancelled",
    paymentStatus: s.paymentStatus === "held" ? "refunded" : s.paymentStatus,
    cancellationReason: reason,
    refundApproved: funded,
    updatedAt: Date.now(),
  });

  await releaseCapacity(ctx, s);
  await notifyParticipants(
    ctx,
    s,
    "Booking cancelled",
    funded
      ? "Delivery fee refunded to sender's wallet."
      : "Booking cancelled. Any late payment will be quarantined for refund reconciliation.",
  );
  await audit(ctx, actor, "shipment.cancelled", reason, s._id);
}

export const cancel = mutation({
  args: {
    tripId: v.id("trips"),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const existingTrip = await ctx.db.get(args.tripId);
    if (!existingTrip || existingTrip.travellerId !== user._id) {
      fail("Your trip was not found.");
    }
    if (existingTrip.status === "cancelled") return;

    const reason = note(args.reason, "Cancellation reason", 5);

    const bookings = await ctx.db
      .query("shipments")
      .withIndex("by_trip", q => q.eq("tripId", existingTrip._id))
      .collect();

    for (const booking of bookings) {
      await cancelBooking(ctx, booking, `Traveller cancelled trip: ${reason}`, user);
    }

    const offers = await ctx.db
      .query("offers")
      .withIndex("by_trip", q => q.eq("tripId", existingTrip._id))
      .collect();

    for (const offer of offers) {
      if (offer.status === "pending") {
        await ctx.db.patch(offer._id, { status: "withdrawn" });
        const parcel = await ctx.db.get(offer.shipmentId);
        if (parcel) {
          await notify(
            ctx,
            parcel.senderId,
            "Offer withdrawn",
            "The traveller cancelled their trip and their carry offer was withdrawn.",
            parcel._id,
          );
        }
      }
    }

    await ctx.db.patch(existingTrip._id, {
      status: "cancelled",
      cancellationReason: reason,
      reservedKg: 0,
    });

    await audit(ctx, user, "trip.cancelled", reason);
  },
});
