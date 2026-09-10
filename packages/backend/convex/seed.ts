import { v } from "convex/values";
import { mutation } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { audit, fail, findUserBySubject, requireAdmin } from "./lib";

const DAY = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;

type ShipmentSeed = {
  senderId: Id<"users">;
  travellerId?: Id<"users">;
  tripId?: Id<"trips">;
  origin: string;
  destination: string;
  description: string;
  category: "Documents" | "Clothing" | "Electronics" | "Books" | "Household items" | "Other";
  weightKg: number;
  valueNaira: number;
  feeNaira: number;
  receiverName: string;
  receiverPhone: string;
  status: Doc<"shipments">["status"];
  paymentStatus: Doc<"shipments">["paymentStatus"];
  createdAt: number;
  updatedAt: number;
  approved: boolean;
  reservationActive: boolean;
  pickupInstructions: string;
  dropoffInstructions: string;
  readyAt?: number;
  deliveryDeadline?: number;
  reviewNote?: string;
  payByAt?: number;
  handoverAt?: number;
  deliveredAt?: number;
  latestLatitude?: number;
  latestLongitude?: number;
  latestLocationLabel?: string;
  latestLocationAt?: number;
  locationCheckInCount?: number;
  cancellationReason?: string;
  refundApproved?: boolean;
  releaseApproved?: boolean;
  pickupIndex?: number;
  dropoffIndex?: number;
};

type TripSeed = {
  travellerId: Id<"users">;
  origin: string;
  destination: string;
  stops: string[];
  departureAt: number;
  arrivalAt: number;
  capacityKg: number;
  reservedKg: number;
  status: "active" | "cancelled" | "completed";
  cancellationReason?: string;
};

function shipmentReference(slug: string, code: string) {
  return `SEED-${slug.slice(0, 4).toUpperCase()}-${code}`;
}

function uniqueDescription(name: string, label: string) {
  return `Seed scenario · ${name} · ${label}`;
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
}

async function mustUser(ctx: MutationCtx, identity: string) {
  const user = await findUserBySubject(ctx, identity);
  if (user) return user;
  const needle = identity.trim().toLowerCase();
  const users = await ctx.db.query("users").collect();
  const byNameOrEmail = users.find(candidate =>
    candidate.name.trim().toLowerCase() === needle
    || (candidate.email?.trim().toLowerCase() ?? "") === needle,
  );
  if (!byNameOrEmail) fail(`User not found for ${identity}.`);
  return byNameOrEmail;
}

async function ensureVerified(ctx: MutationCtx, admin: Doc<"users">, user: Doc<"users">) {
  if (user.verification === "verified") return user;
  const reviewedAt = Date.now();
  await ctx.db.patch(user._id, {
    verification: "verified",
    identityReviewedAt: reviewedAt,
    identityNote: `Seeded verification for ${user.name} so app scenarios are accessible.`,
  });
  const updated = (await ctx.db.get(user._id))!;
  await audit(ctx, admin, "seed.user_verified", `Seed flow marked ${user.name} as verified for app scenario testing.`);
  return updated;
}

async function ensureTrip(ctx: MutationCtx, seed: TripSeed) {
  const rows = await ctx.db.query("trips").withIndex("by_traveller", q => q.eq("travellerId", seed.travellerId)).collect();
  const existing = rows.find(trip =>
    trip.origin === seed.origin
    && trip.destination === seed.destination
    && (trip.status ?? "active") === seed.status
    && trip.capacityKg === seed.capacityKg
    && (trip.cancellationReason ?? "") === (seed.cancellationReason ?? ""),
  );
  if (existing) return { id: existing._id, created: false };
  const id = await ctx.db.insert("trips", seed);
  return { id, created: true };
}

async function ensureShipment(ctx: MutationCtx, slug: string, code: string, seed: ShipmentSeed) {
  const rows = await ctx.db.query("shipments").withIndex("by_sender", q => q.eq("senderId", seed.senderId)).collect();
  const existing = rows.find(shipment => shipment.description === seed.description);
  if (existing) return { id: existing._id, created: false };
  const id = await ctx.db.insert("shipments", {
    reference: shipmentReference(slug, code),
    senderId: seed.senderId,
    travellerId: seed.travellerId,
    tripId: seed.tripId,
    origin: seed.origin,
    destination: seed.destination,
    description: seed.description,
    category: seed.category,
    weightKg: seed.weightKg,
    valueNaira: seed.valueNaira,
    feeNaira: seed.feeNaira,
    receiverName: seed.receiverName,
    receiverPhone: seed.receiverPhone,
    status: seed.status,
    paymentStatus: seed.paymentStatus,
    createdAt: seed.createdAt,
    updatedAt: seed.updatedAt,
    approved: seed.approved,
    reservationActive: seed.reservationActive,
    pickupInstructions: seed.pickupInstructions,
    dropoffInstructions: seed.dropoffInstructions,
    readyAt: seed.readyAt,
    deliveryDeadline: seed.deliveryDeadline,
    reviewNote: seed.reviewNote,
    payByAt: seed.payByAt,
    handoverAt: seed.handoverAt,
    deliveredAt: seed.deliveredAt,
    latestLatitude: seed.latestLatitude,
    latestLongitude: seed.latestLongitude,
    latestLocationLabel: seed.latestLocationLabel,
    latestLocationAt: seed.latestLocationAt,
    locationCheckInCount: seed.locationCheckInCount,
    cancellationReason: seed.cancellationReason,
    refundApproved: seed.refundApproved,
    releaseApproved: seed.releaseApproved,
    pickupIndex: seed.pickupIndex,
    dropoffIndex: seed.dropoffIndex,
  });
  return { id, created: true };
}

async function ensureOffer(ctx: MutationCtx, args: {
  shipmentId: Id<"shipments">;
  tripId: Id<"trips">;
  travellerId: Id<"users">;
  feeNaira: number;
  expiresAt: number;
  createdAt: number;
  status: Doc<"offers">["status"];
  note: string;
}) {
  const rows = await ctx.db.query("offers").withIndex("by_shipment", q => q.eq("shipmentId", args.shipmentId)).collect();
  const existing = rows.find(offer =>
    offer.tripId === args.tripId
    && offer.travellerId === args.travellerId
    && offer.note === args.note,
  );
  if (existing) {
    if (existing.status !== args.status || existing.feeNaira !== args.feeNaira || existing.expiresAt !== args.expiresAt) {
      await ctx.db.patch(existing._id, {
        feeNaira: args.feeNaira,
        expiresAt: args.expiresAt,
        createdAt: args.createdAt,
        status: args.status,
        note: args.note,
      });
    }
    return { id: existing._id, created: false };
  }
  const id = await ctx.db.insert("offers", args);
  return { id, created: true };
}

async function ensureDispute(ctx: MutationCtx, args: {
  shipmentId: Id<"shipments">;
  openedBy: Id<"users">;
  reason: string;
  previousStatus: Doc<"shipments">["status"];
  createdAt: number;
}) {
  const rows = await ctx.db.query("disputes").withIndex("by_shipment", q => q.eq("shipmentId", args.shipmentId)).collect();
  const existing = rows.find(dispute => dispute.reason === args.reason);
  if (existing) return { id: existing._id, created: false };
  const id = await ctx.db.insert("disputes", { ...args, status: "open" });
  return { id, created: true };
}

async function seedUserScenariosCore(ctx: MutationCtx, actor: Doc<"users">, args: {
  targetSubject: string;
  counterpartSenderSubject?: string;
  counterpartTravellerSubject?: string;
}) {
    const target = await mustUser(ctx, args.targetSubject);
    const senderCounterpart = await mustUser(ctx, args.counterpartSenderSubject ?? args.counterpartTravellerSubject ?? "seed.sender@example.com");
    const travellerCounterpart = await mustUser(ctx, args.counterpartTravellerSubject ?? args.counterpartSenderSubject ?? "seed.traveller@example.com");
    const verifiedTarget = await ensureVerified(ctx, actor, target);
    const verifiedSenderCounterpart = await ensureVerified(ctx, actor, senderCounterpart);
    const verifiedTravellerCounterpart = await ensureVerified(ctx, actor, travellerCounterpart);
    const now = Date.now();
    const slug = slugify(verifiedTarget.name || verifiedTarget.subject);
    const prefix = `Seeded app scenarios for ${verifiedTarget.name}`;

    const travellerActiveTrip = await ensureTrip(ctx, {
      travellerId: verifiedTarget._id,
      origin: "Jos",
      destination: "Lagos",
      stops: ["Abuja"],
      departureAt: now + 2 * DAY,
      arrivalAt: now + 2 * DAY + 8 * HOUR,
      capacityKg: 14,
      reservedKg: 0,
      status: "active",
    });

    const travellerCompletedTrip = await ensureTrip(ctx, {
      travellerId: verifiedTarget._id,
      origin: "Jos",
      destination: "Abuja",
      stops: [],
      departureAt: now - 6 * DAY,
      arrivalAt: now - 6 * DAY + 6 * HOUR,
      capacityKg: 10,
      reservedKg: 2,
      status: "completed",
    });

    const travellerCancelledTrip = await ensureTrip(ctx, {
      travellerId: verifiedTarget._id,
      origin: "Jos",
      destination: "Port Harcourt",
      stops: ["Abuja"],
      departureAt: now + DAY,
      arrivalAt: now + DAY + 10 * HOUR,
      capacityKg: 9,
      reservedKg: 0,
      status: "cancelled",
      cancellationReason: `${prefix}: traveller cancelled this trip after schedule changes.`,
    });

    const travellerCompletedShipment = await ensureShipment(ctx, slug, "TRIPDONE", {
      senderId: verifiedSenderCounterpart._id,
      travellerId: verifiedTarget._id,
      tripId: travellerCompletedTrip.id,
      origin: "Jos",
      destination: "Abuja",
      description: uniqueDescription(verifiedTarget.name, "completed trip delivery"),
      category: "Books",
      weightKg: 2,
      valueNaira: 18000,
      feeNaira: 5000,
      receiverName: `${verifiedTarget.name} Demo Receiver`,
      receiverPhone: "+2348011111101",
      status: "delivered",
      paymentStatus: "released",
      createdAt: now - 7 * DAY,
      updatedAt: now - 6 * DAY + 4 * HOUR,
      approved: true,
      reservationActive: true,
      pickupInstructions: "Meet by the old terminal entrance.",
      dropoffInstructions: "Call before getting to the estate gate.",
      readyAt: now - 7 * DAY + HOUR,
      deliveryDeadline: now - 6 * DAY + 8 * HOUR,
      reviewNote: `${prefix}: completed traveller delivery scenario.`,
      payByAt: now - 7 * DAY + 2 * HOUR,
      handoverAt: now - 6 * DAY + HOUR,
      deliveredAt: now - 6 * DAY + 4 * HOUR,
      releaseApproved: true,
      pickupIndex: 0,
      dropoffIndex: 1,
    });

    const travellerCancelledShipment = await ensureShipment(ctx, slug, "TRIPCAN", {
      senderId: verifiedSenderCounterpart._id,
      travellerId: verifiedTarget._id,
      tripId: travellerCancelledTrip.id,
      origin: "Jos",
      destination: "Port Harcourt",
      description: uniqueDescription(verifiedTarget.name, "cancelled trip delivery"),
      category: "Household items",
      weightKg: 3,
      valueNaira: 26000,
      feeNaira: 7000,
      receiverName: `${verifiedTarget.name} Cancelled Receiver`,
      receiverPhone: "+2348011111102",
      status: "cancelled",
      paymentStatus: "unpaid",
      createdAt: now - DAY,
      updatedAt: now - 12 * HOUR,
      approved: true,
      reservationActive: false,
      pickupInstructions: "Meet near the city park gate.",
      dropoffInstructions: "Deliver at the hotel lobby.",
      readyAt: now - 18 * HOUR,
      deliveryDeadline: now + 2 * DAY,
      reviewNote: `${prefix}: cancelled traveller trip scenario.`,
      cancellationReason: `${prefix}: trip cancelled before departure.`,
      pickupIndex: 0,
      dropoffIndex: 2,
    });

    const senderRejectedShipment = await ensureShipment(ctx, slug, "SENDREJ", {
      senderId: verifiedTarget._id,
      origin: "Jos",
      destination: "Abuja",
      description: uniqueDescription(verifiedTarget.name, "rejected outgoing delivery"),
      category: "Documents",
      weightKg: 1,
      valueNaira: 12000,
      feeNaira: 3800,
      receiverName: `${verifiedTarget.name} Rejected Receiver`,
      receiverPhone: "+2348011111103",
      status: "rejected",
      paymentStatus: "unpaid",
      createdAt: now - 10 * HOUR,
      updatedAt: now - 7 * HOUR,
      approved: false,
      reservationActive: false,
      pickupInstructions: "Meet at the pharmacy by the roundabout.",
      dropoffInstructions: "Deliver to the office reception desk.",
      readyAt: now + 2 * HOUR,
      deliveryDeadline: now + 2 * DAY,
      reviewNote: `${prefix}: update the parcel details before it can go live.`,
    });

    const counterpartOfferTrip = await ensureTrip(ctx, {
      travellerId: verifiedTravellerCounterpart._id,
      origin: "Jos",
      destination: "Lagos",
      stops: ["Abuja"],
      departureAt: now + DAY,
      arrivalAt: now + DAY + 9 * HOUR,
      capacityKg: 16,
      reservedKg: 0,
      status: "active",
    });

    const senderOpenShipment = await ensureShipment(ctx, slug, "SENDOPEN", {
      senderId: verifiedTarget._id,
      origin: "Jos",
      destination: "Lagos",
      description: uniqueDescription(verifiedTarget.name, "open outgoing delivery"),
      category: "Documents",
      weightKg: 1,
      valueNaira: 15000,
      feeNaira: 4200,
      receiverName: `${verifiedTarget.name} Open Receiver`,
      receiverPhone: "+2348011111104",
      status: "open",
      paymentStatus: "unpaid",
      createdAt: now - 8 * HOUR,
      updatedAt: now - 6 * HOUR,
      approved: true,
      reservationActive: false,
      pickupInstructions: "Pick up from the main gate security desk.",
      dropoffInstructions: "Drop at the apartment concierge desk.",
      readyAt: now + 3 * HOUR,
      deliveryDeadline: now + 3 * DAY,
      reviewNote: `${prefix}: open outgoing delivery scenario.`,
    });

    const senderOpenOffer = await ensureOffer(ctx, {
      shipmentId: senderOpenShipment.id,
      tripId: counterpartOfferTrip.id,
      travellerId: verifiedTravellerCounterpart._id,
      feeNaira: 4200,
      expiresAt: now + 18 * HOUR,
      createdAt: now - 2 * HOUR,
      status: "pending",
      note: `${prefix}: pending offer waiting for sender review.`,
    });

    const counterpartCarryTrip = await ensureTrip(ctx, {
      travellerId: verifiedTravellerCounterpart._id,
      origin: "Jos",
      destination: "Abuja",
      stops: [],
      departureAt: now + 6 * HOUR,
      arrivalAt: now + 11 * HOUR,
      capacityKg: 11,
      reservedKg: 5,
      status: "active",
    });

    const senderMatchedShipment = await ensureShipment(ctx, slug, "SENDPAY", {
      senderId: verifiedTarget._id,
      travellerId: verifiedTravellerCounterpart._id,
      tripId: counterpartCarryTrip.id,
      origin: "Jos",
      destination: "Abuja",
      description: uniqueDescription(verifiedTarget.name, "matched outgoing delivery"),
      category: "Books",
      weightKg: 2,
      valueNaira: 24000,
      feeNaira: 5000,
      receiverName: `${verifiedTarget.name} Payment Receiver`,
      receiverPhone: "+2348011111105",
      status: "matched",
      paymentStatus: "unpaid",
      createdAt: now - 6 * HOUR,
      updatedAt: now - 90 * 60 * 1000,
      approved: true,
      reservationActive: true,
      pickupInstructions: "Meet by the fuel station entrance.",
      dropoffInstructions: "Deliver at the lobby by the side gate.",
      readyAt: now + HOUR,
      deliveryDeadline: now + 2 * DAY,
      reviewNote: `${prefix}: matched sender payment scenario.`,
      payByAt: now + 4 * HOUR,
      pickupIndex: 0,
      dropoffIndex: 1,
    });

    const senderMatchedOffer = await ensureOffer(ctx, {
      shipmentId: senderMatchedShipment.id,
      tripId: counterpartCarryTrip.id,
      travellerId: verifiedTravellerCounterpart._id,
      feeNaira: 5000,
      expiresAt: now + 5 * HOUR,
      createdAt: now - 3 * HOUR,
      status: "accepted",
      note: `${prefix}: accepted offer awaiting payment.`,
    });
    await ctx.db.patch(senderMatchedShipment.id, { acceptedOfferId: senderMatchedOffer.id });

    const senderFundedShipment = await ensureShipment(ctx, slug, "SENDHAND", {
      senderId: verifiedTarget._id,
      travellerId: verifiedTravellerCounterpart._id,
      tripId: counterpartCarryTrip.id,
      origin: "Jos",
      destination: "Abuja",
      description: uniqueDescription(verifiedTarget.name, "funded outgoing delivery"),
      category: "Clothing",
      weightKg: 2,
      valueNaira: 32000,
      feeNaira: 5600,
      receiverName: `${verifiedTarget.name} Handover Receiver`,
      receiverPhone: "+2348011111106",
      status: "funded",
      paymentStatus: "held",
      createdAt: now - DAY,
      updatedAt: now - 2 * HOUR,
      approved: true,
      reservationActive: true,
      pickupInstructions: "Meet outside the supermarket entrance.",
      dropoffInstructions: "Deliver at the estate main desk.",
      readyAt: now - 8 * HOUR,
      deliveryDeadline: now + DAY,
      reviewNote: `${prefix}: funded sender handover scenario.`,
      payByAt: now - 10 * HOUR,
      pickupIndex: 0,
      dropoffIndex: 1,
    });

    const senderTransitShipment = await ensureShipment(ctx, slug, "SENDMOVE", {
      senderId: verifiedTarget._id,
      travellerId: verifiedTravellerCounterpart._id,
      tripId: counterpartCarryTrip.id,
      origin: "Jos",
      destination: "Abuja",
      description: uniqueDescription(verifiedTarget.name, "ongoing outgoing delivery"),
      category: "Clothing",
      weightKg: 3,
      valueNaira: 45000,
      feeNaira: 6000,
      receiverName: `${verifiedTarget.name} Ongoing Receiver`,
      receiverPhone: "+2348011111107",
      status: "in_transit",
      paymentStatus: "held",
      createdAt: now - DAY,
      updatedAt: now - 30 * 60 * 1000,
      approved: true,
      reservationActive: true,
      pickupInstructions: "Collect near the university junction.",
      dropoffInstructions: "Call at the business district roundabout.",
      readyAt: now - DAY + HOUR,
      deliveryDeadline: now + DAY,
      reviewNote: `${prefix}: ongoing outgoing delivery scenario.`,
      payByAt: now - DAY + 2 * HOUR,
      handoverAt: now - HOUR,
      latestLatitude: 9.0579,
      latestLongitude: 7.4951,
      latestLocationLabel: "Akwanga road check-in",
      latestLocationAt: now - 30 * 60 * 1000,
      locationCheckInCount: 2,
      pickupIndex: 0,
      dropoffIndex: 1,
    });

    const senderDisputedShipment = await ensureShipment(ctx, slug, "SENDDSPT", {
      senderId: verifiedTarget._id,
      travellerId: verifiedTravellerCounterpart._id,
      tripId: counterpartCarryTrip.id,
      origin: "Jos",
      destination: "Abuja",
      description: uniqueDescription(verifiedTarget.name, "disputed outgoing delivery"),
      category: "Electronics",
      weightKg: 2,
      valueNaira: 68000,
      feeNaira: 7500,
      receiverName: `${verifiedTarget.name} Dispute Receiver`,
      receiverPhone: "+2348011111108",
      status: "disputed",
      paymentStatus: "held",
      createdAt: now - 2 * DAY,
      updatedAt: now - 45 * 60 * 1000,
      approved: true,
      reservationActive: true,
      pickupInstructions: "Meet at the shopping mall taxi rank.",
      dropoffInstructions: "Deliver at the clinic reception.",
      readyAt: now - 2 * DAY + HOUR,
      deliveryDeadline: now + 12 * HOUR,
      reviewNote: `${prefix}: disputed outgoing delivery scenario.`,
      payByAt: now - 2 * DAY + 2 * HOUR,
      handoverAt: now - DAY,
      pickupIndex: 0,
      dropoffIndex: 1,
    });

    const senderDispute = await ensureDispute(ctx, {
      shipmentId: senderDisputedShipment.id,
      openedBy: verifiedTarget._id,
      reason: `${prefix}: receiver reported missing item after handover.`,
      previousStatus: "in_transit",
      createdAt: now - 40 * 60 * 1000,
    });

    const travellerFundedShipment = await ensureShipment(ctx, slug, "TRAVHAND", {
      senderId: verifiedSenderCounterpart._id,
      travellerId: verifiedTarget._id,
      tripId: travellerActiveTrip.id,
      origin: "Jos",
      destination: "Lagos",
      description: uniqueDescription(verifiedTarget.name, "funded traveller delivery"),
      category: "Books",
      weightKg: 2,
      valueNaira: 21000,
      feeNaira: 5200,
      receiverName: `${verifiedTarget.name} Traveller Handover Receiver`,
      receiverPhone: "+2348011111109",
      status: "funded",
      paymentStatus: "held",
      createdAt: now - 18 * HOUR,
      updatedAt: now - 3 * HOUR,
      approved: true,
      reservationActive: true,
      pickupInstructions: "Meet by the roadside café entrance.",
      dropoffInstructions: "Deliver to the office block reception in Lagos.",
      readyAt: now - 12 * HOUR,
      deliveryDeadline: now + 2 * DAY,
      reviewNote: `${prefix}: traveller handover confirmation scenario.`,
      payByAt: now - 14 * HOUR,
      pickupIndex: 0,
      dropoffIndex: 2,
    });

    const travellerTransitShipment = await ensureShipment(ctx, slug, "TRAVDROP", {
      senderId: verifiedSenderCounterpart._id,
      travellerId: verifiedTarget._id,
      tripId: travellerActiveTrip.id,
      origin: "Jos",
      destination: "Lagos",
      description: uniqueDescription(verifiedTarget.name, "in-transit traveller delivery"),
      category: "Household items",
      weightKg: 3,
      valueNaira: 36000,
      feeNaira: 6200,
      receiverName: `${verifiedTarget.name} Traveller Delivery Receiver`,
      receiverPhone: "+2348011111110",
      status: "in_transit",
      paymentStatus: "held",
      createdAt: now - DAY,
      updatedAt: now - HOUR,
      approved: true,
      reservationActive: true,
      pickupInstructions: "Collect from the bus park office.",
      dropoffInstructions: "Deliver at the hotel front desk in Lagos.",
      readyAt: now - DAY + HOUR,
      deliveryDeadline: now + DAY,
      reviewNote: `${prefix}: traveller delivery confirmation scenario.`,
      payByAt: now - DAY + 2 * HOUR,
      handoverAt: now - 8 * HOUR,
      latestLatitude: 8.9982,
      latestLongitude: 7.5214,
      latestLocationLabel: "Abaji checkpoint",
      latestLocationAt: now - HOUR,
      locationCheckInCount: 1,
      pickupIndex: 0,
      dropoffIndex: 2,
    });

    const senderDeliveredTrip = await ensureTrip(ctx, {
      travellerId: verifiedTravellerCounterpart._id,
      origin: "Jos",
      destination: "Lagos",
      stops: ["Ibadan"],
      departureAt: now - 4 * DAY,
      arrivalAt: now - 4 * DAY + 9 * HOUR,
      capacityKg: 12,
      reservedKg: 2,
      status: "completed",
    });

    const senderDeliveredShipment = await ensureShipment(ctx, slug, "SENDDONE", {
      senderId: verifiedTarget._id,
      travellerId: verifiedTravellerCounterpart._id,
      tripId: senderDeliveredTrip.id,
      origin: "Jos",
      destination: "Lagos",
      description: uniqueDescription(verifiedTarget.name, "completed outgoing delivery"),
      category: "Electronics",
      weightKg: 2,
      valueNaira: 70000,
      feeNaira: 6500,
      receiverName: `${verifiedTarget.name} Delivered Receiver`,
      receiverPhone: "+2348011111111",
      status: "delivered",
      paymentStatus: "released",
      createdAt: now - 5 * DAY,
      updatedAt: now - 4 * DAY + 6 * HOUR,
      approved: true,
      reservationActive: true,
      pickupInstructions: "Meet outside the shopping plaza entrance.",
      dropoffInstructions: "Deliver at the office reception on arrival.",
      readyAt: now - 5 * DAY + HOUR,
      deliveryDeadline: now - 4 * DAY + 12 * HOUR,
      reviewNote: `${prefix}: completed outgoing delivery scenario.`,
      payByAt: now - 5 * DAY + 2 * HOUR,
      handoverAt: now - 4 * DAY + HOUR,
      deliveredAt: now - 4 * DAY + 6 * HOUR,
      releaseApproved: true,
      pickupIndex: 0,
      dropoffIndex: 2,
    });

    const senderCancelledShipment = await ensureShipment(ctx, slug, "SENDCANC", {
      senderId: verifiedTarget._id,
      origin: "Jos",
      destination: "Port Harcourt",
      description: uniqueDescription(verifiedTarget.name, "cancelled outgoing delivery"),
      category: "Other",
      weightKg: 2,
      valueNaira: 24000,
      feeNaira: 5400,
      receiverName: `${verifiedTarget.name} Cancelled Sender Receiver`,
      receiverPhone: "+2348011111112",
      status: "cancelled",
      paymentStatus: "unpaid",
      createdAt: now - 2 * DAY,
      updatedAt: now - DAY,
      approved: true,
      reservationActive: false,
      pickupInstructions: "Pick up at the intercity park office.",
      dropoffInstructions: "Deliver at the waterfront hotel reception.",
      readyAt: now - 2 * DAY + HOUR,
      deliveryDeadline: now + 2 * DAY,
      reviewNote: `${prefix}: cancelled outgoing delivery scenario.`,
      cancellationReason: `${prefix}: sender cancelled before final matching.`,
    });

    const results = {
      trips: {
        travellerActive: travellerActiveTrip,
        travellerCompleted: travellerCompletedTrip,
        travellerCancelled: travellerCancelledTrip,
        counterpartOffer: counterpartOfferTrip,
        counterpartCarry: counterpartCarryTrip,
        counterpartCompleted: senderDeliveredTrip,
      },
      shipments: {
        travellerCompleted: travellerCompletedShipment,
        travellerCancelled: travellerCancelledShipment,
        travellerFunded: travellerFundedShipment,
        travellerTransit: travellerTransitShipment,
        senderRejected: senderRejectedShipment,
        senderOpen: senderOpenShipment,
        senderMatched: senderMatchedShipment,
        senderFunded: senderFundedShipment,
        senderTransit: senderTransitShipment,
        senderDisputed: senderDisputedShipment,
        senderDelivered: senderDeliveredShipment,
        senderCancelled: senderCancelledShipment,
      },
      offers: {
        senderOpenPending: senderOpenOffer,
        senderMatchedAccepted: senderMatchedOffer,
      },
      disputes: {
        senderDisputed: senderDispute,
      },
    };

    if (
      travellerActiveTrip.created
      || travellerCompletedTrip.created
      || travellerCancelledTrip.created
      || counterpartOfferTrip.created
      || counterpartCarryTrip.created
      || senderDeliveredTrip.created
      || travellerCompletedShipment.created
      || travellerCancelledShipment.created
      || travellerFundedShipment.created
      || travellerTransitShipment.created
      || senderRejectedShipment.created
      || senderOpenShipment.created
      || senderMatchedShipment.created
      || senderFundedShipment.created
      || senderTransitShipment.created
      || senderDisputedShipment.created
      || senderDeliveredShipment.created
      || senderCancelledShipment.created
      || senderOpenOffer.created
      || senderMatchedOffer.created
      || senderDispute.created
    ) {
      await audit(ctx, actor, "seed.user_scenarios", `${prefix} were created or refreshed for app testing.`);
    }

    return {
      targetUserId: verifiedTarget._id,
      targetName: verifiedTarget.name,
      targetSubject: verifiedTarget.subject,
      verified: verifiedTarget.verification,
      results,
    };
}

export const seedUserScenarios = mutation({
  args: {
    targetSubject: v.string(),
    counterpartSenderSubject: v.optional(v.string()),
    counterpartTravellerSubject: v.optional(v.string()),
  },
  handler: async (ctx, args) => seedUserScenariosCore(ctx, await requireAdmin(ctx), args),
});

export const seedUserScenariosLocal = mutation({
  args: {
    targetSubject: v.string(),
    counterpartSenderSubject: v.optional(v.string()),
    counterpartTravellerSubject: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const actor = await mustUser(ctx, args.targetSubject);
    return seedUserScenariosCore(ctx, actor, args);
  },
});
