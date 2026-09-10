import { internalMutation } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { audit, notify, releaseCapacity } from "./lib";

export async function stripLegacyTripPricePerKg(ctx: MutationCtx) {
  const trips = await ctx.db.query("trips").collect();
  let updated = 0;

  for (const trip of trips) {
    if (!("pricePerKg" in trip)) continue;

    const {
      _id,
      _creationTime,
      pricePerKg: _pricePerKg,
      ...next
    } = trip as Doc<"trips"> & { pricePerKg?: number };

    await ctx.db.replace(_id, next);
    updated += 1;
  }

  return { updated };
}

function activeLifecycleStatus(status: string) {
  return ["matched", "funded", "in_transit", "delivered", "disputed"].includes(status);
}

async function reopenExpiredMatch(ctx: MutationCtx, shipment: Doc<"shipments">, reason: string, now: number) {
  if (shipment.acceptedOfferId) {
    const accepted = await ctx.db.get(shipment.acceptedOfferId);
    if (accepted && accepted.status === "accepted") await ctx.db.patch(accepted._id, { status: "expired" });
  }

  await releaseCapacity(ctx, shipment);

  const {
    travellerId: _travellerId,
    tripId: _tripId,
    pickupIndex: _pickupIndex,
    dropoffIndex: _dropoffIndex,
    acceptedOfferId: _acceptedOfferId,
    payByAt: _payByAt,
    ...base
  } = shipment;

  await ctx.db.replace(shipment._id, {
    ...base,
    status: "open",
    paymentStatus: "unpaid",
    reservationActive: false,
    updatedAt: now,
    exception: reason,
  });

  await notify(ctx, shipment.senderId, "Payment window expired", "The accepted booking was reopened after its unpaid reservation expired.", shipment._id);
  if (shipment.travellerId) {
    await notify(ctx, shipment.travellerId, "Offer selection expired", "The sender did not complete payment before the booking deadline.", shipment._id);
  }
  await audit(ctx, null, "shipment.reservation_expired", `Unpaid matched booking reopened (${reason}).`, shipment._id);
}

export const expire = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    let offersExpired = 0;
    let matchesReopened = 0;
    let financeFlagged = 0;
    let tripsCompleted = 0;

    const offers = await ctx.db.query("offers").withIndex("by_status", q => q.eq("status", "pending")).collect();
    for (const offer of offers) {
      if (offer.expiresAt > now) continue;
      await ctx.db.patch(offer._id, { status: "expired" });
      offersExpired += 1;

      const relatedShipment = await ctx.db.get(offer.shipmentId);
      if (relatedShipment) {
        await notify(ctx, offer.travellerId, "Offer expired", "Your offer expired before the sender accepted it.", relatedShipment._id);
        await notify(ctx, relatedShipment.senderId, "Traveller offer expired", "A traveller offer expired before selection.", relatedShipment._id);
        await audit(ctx, null, "offer.expired", "Pending offer expired automatically.", relatedShipment._id);
      }
    }

    const matchedShipments = await ctx.db.query("shipments").withIndex("by_status", q => q.eq("status", "matched")).collect();
    for (const record of matchedShipments) {
      if (!record.reservationActive || !record.tripId) continue;
      const trip = await ctx.db.get(record.tripId);
      const expired = (record.payByAt !== undefined && record.payByAt <= now) || !trip || trip.departureAt <= now;
      if (!expired) continue;

      const payments = await ctx.db.query("payments").withIndex("by_shipment", q => q.eq("shipmentId", record._id)).collect();
      if (payments.some(payment => payment.status === "paid")) continue;
      if (payments.some(payment => !payment.supersededAt && ["pending", "reconciliation_required"].includes(payment.status))) {
        await ctx.db.patch(record._id, { paymentStatus: "reconciliation_required", exception: "payment_reconciliation_required", updatedAt: now });
        await audit(ctx, null, "payment.reconciliation_required", "Expired booking retained because a provider payment reference still needs reconciliation.", record._id);
        financeFlagged += 1;
        continue;
      }

      await reopenExpiredMatch(ctx, record, trip && trip.departureAt <= now ? "trip_departed" : "payment_expired", now);
      matchesReopened += 1;
    }

    const trips = await ctx.db.query("trips").collect();
    for (const trip of trips) {
      if ((trip.status ?? "active") !== "active" || trip.departureAt > now) continue;
      const linked = await ctx.db.query("shipments").withIndex("by_trip", q => q.eq("tripId", trip._id)).collect();
      if (linked.some(shipment => activeLifecycleStatus(shipment.status) && shipment.status !== "cancelled")) continue;
      await ctx.db.patch(trip._id, { status: "completed" });
      tripsCompleted += 1;
    }

    return { offersExpired, matchesReopened, financeFlagged, tripsCompleted };
  },
});

export const stripLegacyTripPricing = internalMutation({
  args: {},
  handler: async (ctx) => stripLegacyTripPricePerKg(ctx),
});
