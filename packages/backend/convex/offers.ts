import { v } from "convex/values";
import { matchExplanation, matchScore, routeSegment } from "@passenger/core";
import { mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import {
  audit,
  fail,
  getTierLimits,
  isAdmin,
  legLoads,
  note,
  notify,
  notifyParticipants,
  offerDto,
  requireSender,
  requireUser,
  requireVerified,
  shipment,
  shipmentDto,
  tripDto,
} from "./lib";

/**
 * Validates compatibility between a shipment and a trip.
 * Rechecked atomically on offer creation and acceptance.
 */
export async function compatible(
  ctx: QueryCtx | MutationCtx,
  s: Doc<"shipments">,
  t: Doc<"trips">,
) {
  const now = Date.now();

  if (s.status !== "open" || !s.approved || !["held", "unpaid", "failed"].includes(s.paymentStatus)) {
    fail("Only approved open parcels accept offers.");
  }
  if (t.status === "cancelled" || t.status === "completed" || t.departureAt <= now) {
    fail("Choose an active future trip.");
  }

  const segment = routeSegment(s, t);
  if (!segment) {
    fail("Pickup must precede drop-off along the ordered trip route.");
  }
  if (!s.readyAt || !s.deliveryDeadline || !t.arrivalAt) {
    fail("Update legacy parcel/trip timing before matching.");
  }

  const windowStart =
    s.preferredPickupAt === undefined
      ? s.readyAt
      : s.preferredPickupAt - (s.pickupFlexBeforeMinutes ?? 0) * 60000;
  const windowEnd =
    s.preferredPickupAt === undefined
      ? undefined
      : s.preferredPickupAt + (s.pickupFlexAfterMinutes ?? 0) * 60000;

  if (
    t.departureAt < windowStart ||
    (windowEnd !== undefined && t.departureAt > windowEnd) ||
    t.arrivalAt > s.deliveryDeadline
  ) {
    fail("Trip timing does not fit the parcel pickup window and delivery deadline.");
  }

  const accepted = t.acceptedCategories?.length ? t.acceptedCategories : undefined;
  if (accepted && !accepted.includes(s.category)) {
    fail("This traveller does not accept the parcel category.");
  }

  if (s.weightKg > (t.maxParcelWeightKg ?? t.capacityKg)) {
    fail("Parcel exceeds this traveller's per-parcel weight limit.");
  }
  if (!s.safetyConsent || !s.evidenceIds?.length) {
    fail("Parcel requires current safety declaration and evidence.");
  }
  if (s.weightKg <= 0 || s.weightKg > 25 || s.valueNaira <= 0 || s.valueNaira > 500000) {
    fail("Parcel exceeds supported weight or value.");
  }

  const sender = await ctx.db.get(s.senderId);
  if (sender) {
    const limits = await getTierLimits(ctx, sender);
    if (s.valueNaira > limits.maxShipmentValueNaira) {
      fail(`The sender's ${limits.tier} permits declaring parcel value up to ₦${limits.maxShipmentValueNaira.toLocaleString()}.`);
    }
  }

  const loads = await legLoads(ctx, t);
  for (let i = segment.pickupIndex; i < segment.dropoffIndex; i++) {
    if (loads[i]! + s.weightKg > t.capacityKg + 0.000001) {
      fail("Insufficient capacity on an overlapping trip leg.");
    }
  }

  return { segment, loads };
}

export async function proposeOffer(
  ctx: MutationCtx,
  args: {
    shipmentId: Id<"shipments">;
    tripId: Id<"trips">;
    expiresAt: number;
    note: string;
  },
) {
  const user = await requireUser(ctx);
  requireVerified(user);

  const s = await shipment(ctx, args.shipmentId);
  const t = await ctx.db.get(args.tripId);
  if (!t || t.travellerId !== user._id) {
    fail("Only the trip owner can propose an offer.");
  }
  if (s.senderId === user._id) {
    fail("You cannot carry your own shipment.");
  }

  const sender = await ctx.db.get(s.senderId);
  if (!sender) fail("Sender unavailable.");
  requireVerified(sender);

  await compatible(ctx, s, t);

  if (
    !Number.isFinite(args.expiresAt) ||
    args.expiresAt <= Date.now() ||
    args.expiresAt > Math.min(t.departureAt, Date.now() + 48 * 3600000)
  ) {
    fail("Offer expiry must be before departure and within 48 hours.");
  }

  const oldOffers = await ctx.db
    .query("offers")
    .withIndex("by_shipment", q => q.eq("shipmentId", s._id))
    .collect();

  if (
    oldOffers.some(
      o => o.tripId === t._id && o.status === "pending" && o.expiresAt > Date.now(),
    )
  ) {
    fail("Withdraw the existing offer before proposing another.");
  }

  const detail = note(args.note, "Offer note", 0, 500);
  const id = await ctx.db.insert("offers", {
    ...args,
    feeNaira: s.feeNaira,
    note: detail,
    travellerId: user._id,
    createdAt: Date.now(),
    status: "pending",
  });

  await notify(
    ctx,
    s.senderId,
    "New traveller offer",
    "Review the trip details before accepting.",
    s._id,
  );
  await audit(ctx, user, "offer.proposed", "Traveller proposed; no capacity reserved.", s._id);
  return id;
}

export const propose = mutation({
  args: {
    shipmentId: v.id("shipments"),
    tripId: v.id("trips"),
    expiresAt: v.number(),
    note: v.string(),
  },
  handler: proposeOffer,
});

export const accept = mutation({
  args: { offerId: v.id("offers") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    requireVerified(user);

    const offer = await ctx.db.get(args.offerId);
    if (!offer || offer.status !== "pending" || offer.expiresAt <= Date.now()) {
      fail("This offer is no longer available.");
    }

    const s = await shipment(ctx, offer.shipmentId);
    requireSender(s, user);

    const t = await ctx.db.get(offer.tripId);
    if (!t || t.travellerId !== offer.travellerId || t.travellerId === user._id) {
      fail("Invalid traveller trip.");
    }

    const traveller = await ctx.db.get(t.travellerId);
    if (!traveller) fail("Traveller unavailable.");
    requireVerified(traveller);

    const { segment, loads } = await compatible(ctx, s, t);

    const unresolved = await ctx.db
      .query("payments")
      .withIndex("by_shipment", q => q.eq("shipmentId", s._id))
      .collect();

    if (unresolved.some(p => p.status !== "failed" && p.status !== "paid")) {
      fail("An existing payment reference needs reconciliation before a new booking.");
    }

    const now = Date.now();
    if (s.paymentStatus === "held") {
      await ctx.db.patch(s._id, {
        status: "funded",
        paymentStatus: "held",
        travellerId: t.travellerId,
        tripId: t._id,
        feeNaira: offer.feeNaira,
        reservationActive: true,
        ...segment,
        acceptedOfferId: offer._id,
        updatedAt: now,
      });
    } else {
      const payByAt = Math.min(now + 30 * 60000, t.departureAt);
      if (payByAt - now < 5 * 60000) {
        fail("At least five minutes are required before departure to accept.");
      }
      await ctx.db.patch(s._id, {
        status: "matched",
        paymentStatus: "unpaid",
        travellerId: t.travellerId,
        tripId: t._id,
        feeNaira: offer.feeNaira,
        reservationActive: true,
        ...segment,
        acceptedOfferId: offer._id,
        payByAt,
        updatedAt: now,
      });
    }

    for (let i = segment.pickupIndex; i < segment.dropoffIndex; i++) {
      loads[i]! += s.weightKg;
    }
    await ctx.db.patch(t._id, { reservedKg: Math.max(0, ...loads) });

    // Update all pending offers on this shipment
    const allOffers = await ctx.db
      .query("offers")
      .withIndex("by_shipment", q => q.eq("shipmentId", s._id))
      .collect();

    for (const otherOffer of allOffers) {
      if (otherOffer.status === "pending") {
        const isAccepted = otherOffer._id === offer._id;
        await ctx.db.patch(otherOffer._id, {
          status: isAccepted ? "accepted" : "declined",
        });

        // Notify other travellers whose pending offers are superseded
        if (!isAccepted) {
          await notify(
            ctx,
            otherOffer.travellerId,
            "Offer superseded",
            "The sender accepted another offer for this parcel.",
            s._id,
          );
        }
      }
    }

    await notifyParticipants(
      ctx,
      s,
      s.paymentStatus === "held" ? "Parcel matched and funded" : "Parcel matched",
      "Check the delivery record for next steps.",
    );
    await audit(
      ctx,
      user,
      "offer.accepted",
      `Sender accepted traveller offer at ₦${offer.feeNaira.toLocaleString()}.`,
      s._id,
    );
  },
});

export const decline = mutation({
  args: { offerId: v.id("offers") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const offer = await ctx.db.get(args.offerId);
    if (!offer || offer.status !== "pending") {
      fail("Pending offer not found.");
    }
    requireSender(await shipment(ctx, offer.shipmentId), user);
    await ctx.db.patch(offer._id, { status: "declined" });
    await notify(
      ctx,
      offer.travellerId,
      "Offer declined",
      "The sender declined your offer.",
      offer.shipmentId,
    );
  },
});

export const withdraw = mutation({
  args: { offerId: v.id("offers") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const offer = await ctx.db.get(args.offerId);
    if (!offer || offer.travellerId !== user._id || offer.status !== "pending") {
      fail("Your pending offer was not found.");
    }

    await ctx.db.patch(offer._id, { status: "withdrawn" });

    const s = await ctx.db.get(offer.shipmentId);
    if (s) {
      await notify(
        ctx,
        s.senderId,
        "Offer withdrawn",
        "A traveller withdrew their carry offer.",
        s._id,
      );
    }
  },
});

export const list = query({
  args: { shipmentId: v.optional(v.id("shipments")) },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const rows = args.shipmentId
      ? await ctx.db
          .query("offers")
          .withIndex("by_shipment", q => q.eq("shipmentId", args.shipmentId!))
          .collect()
      : await ctx.db.query("offers").collect();

    const result = [];
    for (const o of rows) {
      const s = await ctx.db.get(o.shipmentId);
      if (isAdmin(user) || o.travellerId === user._id || s?.senderId === user._id) {
        result.push(await offerDto(ctx, o));
      }
    }
    return result.sort((a, b) => b.createdAt - a.createdAt);
  },
});

/**
 * Query ranked compatible trips for a sender's parcel.
 */
export const matchingTripsForShipment = query({
  args: { shipmentId: v.id("shipments") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const s = await shipment(ctx, args.shipmentId);

    if (s.senderId !== user._id && !isAdmin(user)) {
      fail("Only the sender or admin can view matching trips.");
    }

    const now = Date.now();
    const candidateTrips = await ctx.db
      .query("trips")
      .withIndex("by_departure", q => q.gt("departureAt", now))
      .collect();

    const matches = [];

    for (const trip of candidateTrips) {
      if (trip.travellerId === s.senderId) continue;
      if (trip.status === "cancelled" || trip.status === "completed") continue;

      const traveller = await ctx.db.get(trip.travellerId);
      if (!traveller || traveller.verification !== "verified" || traveller.suspended) continue;

      try {
        const { segment, loads } = await compatible(ctx, s, trip);
        const tripOutput = await tripDto(ctx, trip);
        const score = matchScore(s, tripOutput);
        const explanation = matchExplanation(s, tripOutput);

        let maxSegmentLoad = 0;
        for (let i = segment.pickupIndex; i < segment.dropoffIndex; i++) {
          maxSegmentLoad = Math.max(maxSegmentLoad, loads[i] ?? 0);
        }
        const availableKgOnSegment = Math.max(0, trip.capacityKg - maxSegmentLoad);

        matches.push({
          trip: tripOutput,
          segment,
          availableKgOnSegment,
          score,
          explanation,
        });
      } catch {
        // Not compatible
      }
    }

    return matches.sort((a, b) => a.score - b.score || a.trip.departureAt - b.trip.departureAt);
  },
});

/**
 * Query ranked compatible parcels for a traveller's trip.
 */
export const matchingShipmentsForTrip = query({
  args: { tripId: v.id("trips") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const trip = await ctx.db.get(args.tripId);
    if (!trip || (trip.travellerId !== user._id && !isAdmin(user))) {
      fail("Only the trip owner or admin can view matching parcels.");
    }

    const candidateShipments = await ctx.db
      .query("shipments")
      .withIndex("by_status", q => q.eq("status", "open"))
      .collect();

    const tripOutput = await tripDto(ctx, trip);
    const matches = [];

    for (const s of candidateShipments) {
      if (s.senderId === trip.travellerId) continue;
      if (!s.approved) continue;

      try {
        const { segment, loads } = await compatible(ctx, s, trip);
        const shipmentOutput = await shipmentDto(ctx, s, false);
        const score = matchScore(s, tripOutput);
        const explanation = matchExplanation(s, tripOutput);

        let maxSegmentLoad = 0;
        for (let i = segment.pickupIndex; i < segment.dropoffIndex; i++) {
          maxSegmentLoad = Math.max(maxSegmentLoad, loads[i] ?? 0);
        }
        const availableKgOnSegment = Math.max(0, trip.capacityKg - maxSegmentLoad);

        matches.push({
          shipment: shipmentOutput,
          segment,
          availableKgOnSegment,
          score,
          explanation,
        });
      } catch {
        // Not compatible
      }
    }

    return matches.sort(
      (a, b) =>
        a.score - b.score ||
        (a.shipment.preferredPickupAt ?? a.shipment.readyAt ?? 0) -
          (b.shipment.preferredPickupAt ?? b.shipment.readyAt ?? 0),
    );
  },
});
