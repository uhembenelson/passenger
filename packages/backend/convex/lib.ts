import { ConvexError } from "convex/values";
import type { Offer, Person, Shipment, ShipmentStatus, Trip, FeeConfig } from "@passenger/core";
import { assertTransition, quoteFee, routeSegment, tripRoute } from "@passenger/core";
import type { Doc, Id } from "./_generated/dataModel";
import type { ActionCtx, MutationCtx, QueryCtx } from "./_generated/server";

export function fail(message: string): never {
  throw new ConvexError(message);
}

export async function getFeeConfig(ctx: QueryCtx | MutationCtx): Promise<FeeConfig | undefined> {
  const rows = await ctx.db.query("feeConfig").collect();
  const doc = rows[0];
  if (!doc) return undefined;
  return {
    platformFeePercent: doc.platformFeePercent,
    baseFeeNaira: doc.baseFeeNaira,
    distanceRateNairaPerKm: doc.distanceRateNairaPerKm,
    minFeeNaira: doc.minFeeNaira ?? 2000,
    categoryMultipliers: doc.categoryMultipliers as Record<string, number> | undefined,
    weightMultipliers: doc.weightMultipliers as { minKg: number; maxKg: number; multiplier: number }[] | undefined,
    updatedAt: doc.updatedAt,
  };
}

export type TierLimits = {
  tier: "Tier 1" | "Tier 2" | "Tier 3";
  maxCapacityKg: number;
  maxShipmentValueNaira: number;
};

export async function getTierLimits(ctx: QueryCtx | MutationCtx, user: Pick<Doc<"users">, "tier" | "verification">): Promise<TierLimits> {
  const tier = user.tier ?? "Tier 1";
  const configs = await ctx.db.query("kycTiers").withIndex("by_created").collect();
  const config = configs.find((c) => c.tierName.trim().toLowerCase() === tier.toLowerCase());
  return {
    tier,
    maxCapacityKg: config?.maxCapacityKg ?? 100,
    maxShipmentValueNaira: config ? config.maxShipmentValueNaira : 500000,
  };
}

const allowlist = (value: string | undefined) =>
  String(value ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);

export const isAdmin = (user: Doc<"users">) =>
  allowlist(process.env.ADMIN_USER_EMAILS).includes(user.email?.toLowerCase() ?? "") ||
  allowlist(process.env.ADMIN_CLERK_SUBJECTS).includes(user.subject.toLowerCase());

export const isCompliance = (user: Doc<"users">) =>
  allowlist(process.env.COMPLIANCE_USER_EMAILS).includes(user.email?.toLowerCase() ?? "") ||
  allowlist(process.env.COMPLIANCE_CLERK_SUBJECTS).includes(user.subject.toLowerCase());

export const isStaff = (user: Doc<"users">) => isAdmin(user) || isCompliance(user);

export const closeResolvedChatAfterMs = 3 * 24 * 60 * 60 * 1000;

export function effectiveChatStatus(
  chat: { status: "unresolved" | "resolved" | "closed"; resolvedAt?: number },
  now = Date.now(),
): "unresolved" | "resolved" | "closed" {
  if (chat.status === "resolved" && chat.resolvedAt && now - chat.resolvedAt >= closeResolvedChatAfterMs) {
    return "closed";
  }
  return chat.status;
}

export async function subject(ctx: Pick<ActionCtx, "auth">) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) fail("Sign in required.");
  return identity.subject.split("|")[0]!;
}

export async function findUserBySubject(ctx: QueryCtx | MutationCtx, sub: string) {
  const normalized = sub.split("|")[0]!;
  const id = ctx.db.normalizeId("users", normalized);
  if (id) {
    const user = await ctx.db.get(id);
    if (user) return user;
  }
  return ctx.db.query("users").withIndex("by_subject", q => q.eq("subject", sub)).unique();
}

export async function userBySubject(ctx: QueryCtx | MutationCtx, sub: string) {
  const user = await findUserBySubject(ctx, sub);
  if (!user) fail("Complete your profile first.");
  return user;
}

export async function requireUser(ctx: QueryCtx | MutationCtx) {
  return userBySubject(ctx, await subject(ctx));
}

export async function requireAdmin(ctx: QueryCtx | MutationCtx) {
  const user = await requireUser(ctx);
  if (!isStaff(user) || user.suspended) fail("Administrator access required.");
  return user;
}

export async function requireCompliance(ctx: QueryCtx | MutationCtx) {
  const user = await requireUser(ctx);
  if (!isCompliance(user) || user.suspended) fail("Compliance officer access required. Identity review is restricted to compliance staff.");
  return user;
}

export function requireActive(user: Doc<"users">) {
  if (user.suspended) fail("Your account is suspended. Active delivery and support records remain accessible.");
}

export const requireVerified = (user: Doc<"users">) => {
  requireActive(user);
  if (user.verification !== "verified") fail("Manual identity verification is required.");
};

export function person(user: Doc<"users">, privateFields = false, includeCompliance = privateFields): Person {
  return {
    id: user._id,
    name: user.name,
    phone: privateFields ? user.phone : "",
    email: privateFields ? user.email : undefined,
    image: user.image,
    tier: user.tier ?? (user.verification === "verified" ? "Tier 2" : "Tier 1"),
    verification: user.verification,
    role: isCompliance(user) ? "compliance" : isAdmin(user) ? "admin" : "member",
    joinedAt: user.joinedAt,
    suspended: user.suspended ?? false,
    ...(privateFields
      ? {
          phoneVerificationTime: includeCompliance ? user.phoneVerificationTime : undefined,
          suspensionReason: user.suspensionReason,
          identityNote: includeCompliance ? user.identityNote : undefined,
          identitySubmittedAt: includeCompliance ? user.identitySubmittedAt : undefined,
          documentType: includeCompliance ? user.documentType : undefined,
          identityEvidenceIds: includeCompliance ? user.identityEvidenceIds : undefined,
          walletBalanceNaira: user.walletBalanceNaira ?? 0,
          bvn: includeCompliance ? user.bvn : undefined,
          residenceState: includeCompliance ? user.residenceState : undefined,
          residenceLga: includeCompliance ? user.residenceLga : undefined,
          residenceAddress: includeCompliance ? user.residenceAddress : undefined,
          streetPhotoUrl: includeCompliance ? user.streetPhotoUrl : undefined,
          housePhotoUrl: includeCompliance ? user.housePhotoUrl : undefined,
        }
      : {}),
  };
}

export async function personDto(ctx: QueryCtx, user: Doc<"users">, privateFields = false, includeCompliance = privateFields): Promise<Person> {
  const reviews = await ctx.db.query("reviews").withIndex("by_target", q => q.eq("targetId", user._id)).collect();
  const deliveries = await ctx.db.query("shipments").withIndex("by_traveller", q => q.eq("travellerId", user._id)).collect();
  const storedImage = user.profileImageStorageId ? await ctx.storage.getUrl(user.profileImageStorageId) : null;
  return {
    ...person(user, privateFields, includeCompliance),
    image: storedImage ?? user.image,
    rating: reviews.length ? reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length : 0,
    reviewCount: reviews.length,
    successfulDeliveries: deliveries.filter(shipment => !!shipment.deliveredAt && shipment.status === "delivered").length,
  };
}

export async function shipment(ctx: QueryCtx | MutationCtx, id: Id<"shipments">) {
  const record = await ctx.db.get(id);
  if (!record) fail("Shipment not found.");
  return record;
}

export const participant = (shipment: Doc<"shipments">, user: Doc<"users">) =>
  shipment.senderId === user._id || shipment.travellerId === user._id;

export function requireParticipant(shipment: Doc<"shipments">, user: Doc<"users">) {
  if (!participant(shipment, user)) fail("Shipment participant access required.");
}

export function requireSender(shipment: Doc<"shipments">, user: Doc<"users">) {
  if (shipment.senderId !== user._id) fail("Only the sender can perform this action.");
}

export function requireTraveller(shipment: Doc<"shipments">, user: Doc<"users">) {
  if (shipment.travellerId !== user._id) fail("Only the matched traveller can perform this action.");
}

export async function audit(
  ctx: MutationCtx,
  actor: Doc<"users"> | null,
  action: string,
  detail: string,
  shipmentId?: Id<"shipments">,
) {
  await ctx.db.insert("audits", {
    actorId: actor?._id,
    actorName: actor?.name ?? "System",
    action,
    detail,
    shipmentId,
    createdAt: Date.now(),
  });
}

export async function notify(ctx: MutationCtx, userId: Id<"users">, title: string, body: string, shipmentId?: Id<"shipments">) {
  await ctx.db.insert("notifications", { userId, title, body, shipmentId, createdAt: Date.now() });
}

export async function notifyParticipants(ctx: MutationCtx, shipment: Doc<"shipments">, title: string, body: string) {
  for (const id of new Set([shipment.senderId, ...(shipment.travellerId ? [shipment.travellerId] : [])])) {
    await notify(ctx, id, title, body, shipment._id);
  }
}

export async function transition(ctx: MutationCtx, shipment: Doc<"shipments">, status: ShipmentStatus) {
  assertTransition(shipment.status, status);
  await ctx.db.patch(shipment._id, { status, updatedAt: Date.now() });
}

export function note(value: string, label = "Note", min = 3, max = 1000) {
  const text = value.trim();
  if (text.length < min || text.length > max) fail(`${label} must be ${min}–${max} characters.`);
  return text;
}

export async function noOpenDispute(ctx: QueryCtx | MutationCtx, shipmentId: Id<"shipments">) {
  const disputes = await ctx.db.query("disputes").withIndex("by_shipment", q => q.eq("shipmentId", shipmentId)).collect();
  if (disputes.some(dispute => dispute.status === "open")) fail("An open dispute freezes this operation.");
}

export async function legLoads(ctx: QueryCtx | MutationCtx, trip: Doc<"trips">, excluding?: Id<"shipments">) {
  const loads = Array<number>(tripRoute(trip).length - 1).fill(0);
  const bookings = await ctx.db.query("shipments").withIndex("by_trip", q => q.eq("tripId", trip._id)).collect();
  for (const booking of bookings) {
    if (!booking.reservationActive || booking._id === excluding) continue;
    const segment = routeSegment(booking, trip);
    if (!segment) fail("A reserved booking has an invalid route; contact support.");
    for (let index = segment.pickupIndex; index < segment.dropoffIndex; index++) loads[index]! += booking.weightKg;
  }
  return loads;
}

export async function releaseCapacity(ctx: MutationCtx, shipment: Doc<"shipments">) {
  if (!shipment.reservationActive) return;
  await ctx.db.patch(shipment._id, { reservationActive: false });
  if (shipment.tripId) {
    const trip = await ctx.db.get(shipment.tripId);
    if (trip) await ctx.db.patch(trip._id, { reservedKg: Math.max(0, ...(await legLoads(ctx, trip, shipment._id))) });
  }
}

export async function tripDto(ctx: QueryCtx, trip: Doc<"trips">): Promise<Trip> {
  const traveller = await ctx.db.get(trip.travellerId);
  const loads = await legLoads(ctx, trip);
  return {
    id: trip._id,
    travellerId: trip.travellerId,
    travellerName: traveller?.name ?? "Member",
    origin: trip.origin,
    destination: trip.destination,
    stops: trip.stops ?? [],
    departureAt: trip.departureAt,
    arrivalAt: trip.arrivalAt,
    capacityKg: trip.capacityKg,
    reservedKg: Math.max(0, ...loads),
    legReservedKg: loads,
    acceptedCategories: trip.acceptedCategories,
    maxParcelWeightKg: trip.maxParcelWeightKg,
    handlingNotes: trip.handlingNotes,
    verified: traveller?.verification === "verified" && !traveller.suspended,
    status: trip.status ?? "active",
  };
}

export async function offerDto(ctx: QueryCtx, offer: Doc<"offers">): Promise<Offer> {
  const traveller = await ctx.db.get(offer.travellerId);
  return {
    id: offer._id,
    shipmentId: offer.shipmentId,
    tripId: offer.tripId,
    travellerId: offer.travellerId,
    travellerName: traveller?.name ?? "Member",
    feeNaira: offer.feeNaira,
    expiresAt: offer.expiresAt,
    createdAt: offer.createdAt,
    status: offer.status,
    note: offer.note,
    quote: quoteFee(offer.feeNaira),
  };
}

function locationCheckInSummary(shipment: Doc<"shipments">, trip: Doc<"trips"> | null, now = Date.now()) {
  if (!shipment.travellerId || !["in_transit", "delivered"].includes(shipment.status)) return {};

  const startAt = shipment.handoverAt ?? trip?.departureAt ?? shipment.updatedAt;
  const endAt = trip?.arrivalAt ?? shipment.deliveryDeadline ?? startAt + 6 * 60 * 60 * 1000;
  const duration = Math.max(2 * 60 * 60 * 1000, endAt - startAt);
  const target = duration > 6 * 60 * 60 * 1000 || (trip?.stops?.length ?? 0) > 0 ? 4 : 3;
  const completed = Math.min(target, Math.max(0, shipment.locationCheckInCount ?? (shipment.latestLocationAt ? 1 : 0)));
  const remaining = shipment.status === "delivered" ? 0 : Math.max(0, target - completed);
  const segment = duration / (target + 1);
  const grace = Math.max(15 * 60 * 1000, Math.round(segment * 0.35));
  const checkpointsPassed = Array.from({ length: target }, (_, index) => index + 1).filter(
    step => now > startAt + step * segment + grace,
  ).length;
  const missed = shipment.status === "delivered" ? 0 : Math.max(0, checkpointsPassed - completed);
  const nextAt = remaining > 0 ? Math.round(startAt + (completed + 1) * segment) : undefined;
  const state = shipment.status === "delivered" || remaining === 0
    ? "complete"
    : missed > 0
      ? "overdue"
      : nextAt !== undefined && now >= nextAt - Math.max(10 * 60 * 1000, segment * 0.2)
        ? "due_soon"
        : "up_to_date";

  return {
    locationCheckInCount: completed,
    locationCheckInTarget: target,
    locationCheckInRemaining: remaining,
    missedLocationCheckIns: missed,
    nextLocationCheckInAt: nextAt,
    locationCheckInState: state,
  } satisfies Pick<
    Shipment,
    | "locationCheckInCount"
    | "locationCheckInTarget"
    | "locationCheckInRemaining"
    | "missedLocationCheckIns"
    | "nextLocationCheckInAt"
    | "locationCheckInState"
  >;
}

export async function shipmentDto(ctx: QueryCtx, shipment: Doc<"shipments">, privateFields: boolean): Promise<Shipment> {
  const sender = await ctx.db.get(shipment.senderId);
  const traveller = shipment.travellerId ? await ctx.db.get(shipment.travellerId) : null;
  const trip = shipment.tripId ? await ctx.db.get(shipment.tripId) : null;

  return {
    id: shipment._id,
    reference: shipment.reference,
    senderId: shipment.senderId,
    senderName: sender?.name ?? "Member",
    travellerId: shipment.travellerId,
    travellerName: traveller?.name,
    origin: shipment.origin,
    destination: shipment.destination,
    description: shipment.description,
    category: shipment.category,
    weightKg: shipment.weightKg,
    valueNaira: privateFields ? shipment.valueNaira : 0,
    feeNaira: shipment.feeNaira,
    receiverName: privateFields ? shipment.receiverName : "",
    receiverPhone: privateFields ? shipment.receiverPhone : "",
    status: shipment.status,
    paymentStatus: shipment.paymentStatus,
    createdAt: shipment.createdAt,
    updatedAt: shipment.updatedAt,
    tripId: shipment.tripId,
    readyAt: shipment.readyAt,
    preferredPickupAt: shipment.preferredPickupAt,
    pickupFlexBeforeMinutes: shipment.pickupFlexBeforeMinutes,
    pickupFlexAfterMinutes: shipment.pickupFlexAfterMinutes,
    deliveryDeadline: shipment.deliveryDeadline,
    quote: quoteFee(shipment.feeNaira),
    ...locationCheckInSummary(shipment, trip),
    ...(privateFields
      ? {
          pickupInstructions: shipment.pickupInstructions,
          dropoffInstructions: shipment.dropoffInstructions,
          evidenceIds: shipment.evidenceIds,
          safetyConsent: shipment.safetyConsent,
          reviewNote: shipment.reviewNote,
          payByAt: shipment.payByAt,
          handoverAt: shipment.handoverAt,
          deliveredAt: shipment.deliveredAt,
          latestLatitude: shipment.latestLatitude,
          latestLongitude: shipment.latestLongitude,
          latestLocationLabel: shipment.latestLocationLabel,
          latestLocationAt: shipment.latestLocationAt,
          disputeUntil: shipment.disputeUntil,
          exception: shipment.exception,
          cancellationReason: shipment.cancellationReason,
          refundApproved: shipment.refundApproved,
          releaseApproved: shipment.releaseApproved,
        }
      : {}),
  };
}
