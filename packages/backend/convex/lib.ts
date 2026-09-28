import { ConvexError } from "convex/values";
import type { Offer, Person, Shipment, ShipmentStatus, Trip, FeeConfig, PermissionKey, CreateShipmentInput, CreateTripInput, FeeQuote } from "@passenger/core";
import { assertTransition, normalizePhone, quoteFee, routeSegment, tripRoute, validateShipment, validateTrip } from "@passenger/core";
import type { Doc, Id } from "./_generated/dataModel";
import type { ActionCtx, MutationCtx, QueryCtx } from "./_generated/server";
import { verificationPolicy } from "./verificationPolicy";

export function smsConfigured() {
  return !!(process.env.TERMII_API_KEY && process.env.TERMII_SENDER_ID);
}

export function fail(message: string): never {
  throw new ConvexError(message);
}

export function safeNormalizePhone(value: string): string {
  try {
    return normalizePhone(value);
  } catch (e) {
    fail(e instanceof Error ? e.message : "Enter a valid phone number.");
  }
}

export function safeValidateShipment(input: CreateShipmentInput, now?: number): void {
  try {
    validateShipment(input, now);
  } catch (e) {
    fail(e instanceof Error ? e.message : "Invalid parcel details.");
  }
}

export function safeValidateTrip(input: CreateTripInput, now?: number): void {
  try {
    validateTrip(input, now);
  } catch (e) {
    fail(e instanceof Error ? e.message : "Invalid trip details.");
  }
}

export function safeQuoteFee(feeNaira: number): FeeQuote {
  try {
    return quoteFee(feeNaira);
  } catch {
    const grossNaira = Math.max(0, Math.floor(feeNaira || 0));
    const grossKobo = grossNaira * 100;
    const platformFeeKobo = Math.round(grossKobo / 10);
    return {
      grossNaira,
      grossKobo,
      platformFeeKobo,
      travellerNetKobo: grossKobo - platformFeeKobo,
      platformFeePercent: 10 as const,
    };
  }
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

export type TierName = "Tier 0" | "Tier 1" | "Tier 2" | "Tier 3";

export function effectiveTierName(user: Pick<Doc<"users">, "kycTier" | "tier">): TierName | null {
  if (user.kycTier !== undefined) return `Tier ${user.kycTier}` as TierName;
  if (user.tier === "Tier 1" || user.tier === "Tier 2" || user.tier === "Tier 3") return user.tier;
  return null;
}

export type TierLimits = {
  tier: "No Tier" | "Tier 0" | TierName;
  maxCapacityKg: number;
  maxShipmentValueNaira: number;
};

export async function getTierLimits(ctx: QueryCtx | MutationCtx, user: Pick<Doc<"users">, "kycTier" | "tier">): Promise<TierLimits> {
  const tier = effectiveTierName(user);
  if (tier === null || tier === "Tier 0") {
    return { tier: tier === null ? "No Tier" : "Tier 0", maxCapacityKg: 0, maxShipmentValueNaira: 0 };
  }
  const configs = await ctx.db.query("kycTiers").withIndex("by_created").collect();
  const config = configs.find((c) => c.tierName.trim().toLowerCase() === tier.toLowerCase());
  const fallback = tier === "Tier 1" ? verificationPolicy.tier1DefaultLimits : { maxCapacityKg: 100, maxShipmentValueNaira: 500000 };
  return {
    tier,
    maxCapacityKg: config?.maxCapacityKg ?? fallback.maxCapacityKg,
    maxShipmentValueNaira: config ? config.maxShipmentValueNaira : fallback.maxShipmentValueNaira,
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

export async function isTeamMember(ctx: QueryCtx | MutationCtx, user: Doc<"users">): Promise<boolean> {
  const viewerEmail = (user.email ?? "").toLowerCase();
  if (!viewerEmail) return false;
  const teamMembers = await ctx.db.query("teamMembers").collect();
  return teamMembers.some(m => m.email.toLowerCase() === viewerEmail);
}

export async function requireAdmin(ctx: QueryCtx | MutationCtx) {
  const user = await requireUser(ctx);
  if (user.suspended) fail("Administrator access required.");
  const isTeam = await isTeamMember(ctx, user);
  if (!isStaff(user) && !isTeam) fail("Administrator access required.");
  return user;
}

export async function requireCompliance(ctx: QueryCtx | MutationCtx) {
  const user = await requireUser(ctx);
  if (!isCompliance(user) || user.suspended) fail("Compliance officer access required. Identity review is restricted to compliance staff.");
  return user;
}

export async function hasPermission(ctx: QueryCtx | MutationCtx, user: Doc<"users">, permissionName: PermissionKey): Promise<boolean> {
  if (user.suspended) return false;
  if (isAdmin(user)) return true;
  const viewerEmail = (user.email ?? "").toLowerCase();
  if (!viewerEmail) return false;
  const teamMembers = await ctx.db.query("teamMembers").collect();
  const member = teamMembers.find(m => m.email.toLowerCase() === viewerEmail);
  if (!member) return false;
  const permissions = await ctx.db.query("permissions").collect();
  const permission = permissions.find(p => p.name === permissionName);
  if (!permission) return false;
  const grants = await ctx.db.query("permissionGrants").withIndex("by_permission", q => q.eq("permissionId", permission._id)).collect();
  return grants.some(g => g.adminRoleId === member.adminRoleId && g.roleTitle === member.roleTitle && g.granted);
}

export async function requirePermission(ctx: QueryCtx | MutationCtx, user: Doc<"users">, permissionName: PermissionKey) {
  if (user.suspended) fail("Administrator access required.");
  const isTeam = await isTeamMember(ctx, user);
  if (!isStaff(user) && !isTeam) fail("Administrator access required.");
  if (await hasPermission(ctx, user, permissionName)) return;
  fail(`You don't have permission to perform this action: ${permissionName}`);
}

export function requireActive(user: Doc<"users">) {
  if (user.suspended) fail("Your account is suspended. Active delivery and support records remain accessible.");
}

export const requireVerified = (user: Doc<"users">) => {
  requireActive(user);
  if (user.verification !== "verified") fail("Manual identity verification is required.");
};

// Stable verification/security error codes (plan §28).
// Frontend maps these to user-friendly messages instead of parsing strings.
export const VERIFICATION_ERROR_CODES = {
  VERIFICATION_REQUIRED: "VERIFICATION_REQUIRED",
  PHONE_VERIFICATION_REQUIRED: "PHONE_VERIFICATION_REQUIRED",
  IDENTITY_NUMBER_VERIFICATION_REQUIRED: "IDENTITY_NUMBER_VERIFICATION_REQUIRED",
  TIER1_REQUIRED: "TIER1_REQUIRED",
  VERIFICATION_PENDING: "VERIFICATION_PENDING",
  VERIFICATION_REJECTED: "VERIFICATION_REJECTED",
  ADDRESS_VERIFICATION_REQUIRED: "ADDRESS_VERIFICATION_REQUIRED",
  ADDRESS_SESSION_EXPIRED: "ADDRESS_SESSION_EXPIRED",
  LOCATION_ACCURACY_TOO_LOW: "LOCATION_ACCURACY_TOO_LOW",
  ADDRESS_GEOCODING_UNAVAILABLE: "ADDRESS_GEOCODING_UNAVAILABLE",
  EVIDENCE_REQUIRED: "EVIDENCE_REQUIRED",
  NOT_AUTHORISED: "NOT_AUTHORISED",
  SELF_REVIEW_NOT_ALLOWED: "SELF_REVIEW_NOT_ALLOWED",
} as const;
export type VerificationErrorCode = (typeof VERIFICATION_ERROR_CODES)[keyof typeof VERIFICATION_ERROR_CODES];

export function failWithCode(code: VerificationErrorCode, message = ""): never {
  throw new ConvexError({ code, message: message || code });
}

// Tier represents trust earned, not merely account status.
// A missing tier must never be silently read as a real tier (plan §2).
export function getUserTier(user: Pick<Doc<"users">, "kycTier">): number | null {
  return user.kycTier ?? null;
}

export function identityStatus(user: Pick<Doc<"users">, "identityVerificationStatus">): NonNullable<Doc<"users">["identityVerificationStatus"]> {
  return user.identityVerificationStatus ?? "unverified";
}

export function isPhoneVerified(user: Pick<Doc<"users">, "phoneVerifiedAt" | "phoneVerificationTime">): boolean {
  return user.phoneVerifiedAt !== undefined || user.phoneVerificationTime !== undefined;
}

export function isIdentityNumberVerified(user: Pick<Doc<"users">, "identityNumberVerifiedAt" | "identityNumberVerificationType">): boolean {
  return user.identityNumberVerifiedAt !== undefined && (user.identityNumberVerificationType === "BVN" || user.identityNumberVerificationType === "NIN");
}

export async function requireIdentityNumberVerified(ctx: QueryCtx | MutationCtx, userId: Id<"users">): Promise<Doc<"users">> {
  const user = await ctx.db.get(userId);
  if (!user) fail("Member not found.");
  if (!isIdentityNumberVerified(user)) failWithCode(VERIFICATION_ERROR_CODES.IDENTITY_NUMBER_VERIFICATION_REQUIRED, "Verify your identity with BVN or NIN to continue.");
  return user;
}

export async function requirePhoneVerified(ctx: QueryCtx | MutationCtx, userId: Id<"users">): Promise<Doc<"users">> {
  const user = await ctx.db.get(userId);
  if (!user) fail("Member not found.");
  if (!isPhoneVerified(user)) failWithCode(VERIFICATION_ERROR_CODES.PHONE_VERIFICATION_REQUIRED, "Verify your phone number to continue.");
  return user;
}

export async function requireTier(ctx: QueryCtx | MutationCtx, userId: Id<"users">, minimumTier: number): Promise<Doc<"users">> {
  const user = await ctx.db.get(userId);
  if (!user) fail("Member not found.");
  const tier = getUserTier(user);
  if (tier === null || tier < minimumTier) {
    failWithCode(
      minimumTier <= 1 ? VERIFICATION_ERROR_CODES.TIER1_REQUIRED : VERIFICATION_ERROR_CODES.VERIFICATION_REQUIRED,
      "A higher verification tier is required for this action.",
    );
  }
  return user;
}

export async function requireTransactionalVerification(ctx: QueryCtx | MutationCtx, userId: Id<"users">): Promise<Doc<"users">> {
  const user = await ctx.db.get(userId);
  if (!user) fail("Member not found.");
  if (identityStatus(user) !== "verified" || (getUserTier(user) ?? -1) < 1) {
    failWithCode(VERIFICATION_ERROR_CODES.VERIFICATION_REQUIRED, "Identity verification is required to send or carry packages.");
  }
  return user;
}

export async function markPhoneVerified(ctx: MutationCtx, user: Doc<"users">, verifiedAt = Date.now()): Promise<void> {
  const currentTier = getUserTier(user);
  const nextTier = Math.max(currentTier ?? 0, 0) as NonNullable<Doc<"users">["kycTier"]>;
  await ctx.db.patch(user._id, {
    phoneVerifiedAt: verifiedAt,
    phoneVerificationTime: verifiedAt,
    kycTier: nextTier,
  });
  await audit(ctx, user, "verification.phone_verified", currentTier === null ? "Phone number verified by one-time code. Tier 0 granted." : `Phone number verified by one-time code. Tier ${nextTier} retained.`);
}

export function person(user: Doc<"users">, privateFields = false, includeCompliance = privateFields): Person {
  return {
    id: user._id,
    name: user.name,
    phone: privateFields ? user.phone : "",
    email: privateFields ? user.email : undefined,
    image: user.image,
    tier: effectiveTierName(user) ?? undefined,
    kycTier: user.kycTier,
    identityVerificationStatus: identityStatus(user),
    identityNumberVerificationType: privateFields ? user.identityNumberVerificationType : undefined,
    identityNumberVerifiedAt: privateFields ? user.identityNumberVerifiedAt : undefined,
    identityNumberLast4: privateFields ? user.identityNumberLast4 : undefined,
    identityNumberVerifiedName: privateFields ? user.identityNumberVerifiedName : undefined,
    identityBioData: privateFields ? user.identityBioData : undefined,
    identityFaceVerificationStatus: privateFields ? user.identityFaceVerificationStatus : undefined,
    identityFaceVerifiedAt: privateFields ? user.identityFaceVerifiedAt : undefined,
    phoneVerifiedAt: privateFields ? user.phoneVerifiedAt : undefined,
    verification: user.verification,
    role: isCompliance(user) ? "compliance" : isAdmin(user) ? "admin" : "member",
    joinedAt: user.joinedAt,
    activationDestination: privateFields ? user.activationDestination : undefined,
    suspended: user.suspended ?? false,
    ...(privateFields
      ? {
          phoneVerificationEnabled: true,
          phoneVerificationTime: includeCompliance ? user.phoneVerificationTime : undefined,
          suspensionReason: user.suspensionReason,
          identityNote: includeCompliance ? user.identityNote : undefined,
          lastVerificationReviewNote: includeCompliance ? user.lastVerificationReviewNote : undefined,
          identitySubmittedAt: includeCompliance ? user.identitySubmittedAt : undefined,
          documentType: includeCompliance ? user.documentType : undefined,
          identityEvidenceIds: includeCompliance ? user.identityEvidenceIds : undefined,
          walletBalanceNaira: Math.max(0, user.walletVerifiedBalanceNaira ?? 0),
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
  const reviews = await ctx.db.query("reviews").withIndex("by_target", q => q.eq("targetId", user._id)).order("desc").take(500);
  const deliveries = await ctx.db.query("shipments").withIndex("by_traveller", q => q.eq("travellerId", user._id)).order("desc").take(500);
  const storedImage = user.profileImageStorageId ? await ctx.storage.getUrl(user.profileImageStorageId) : null;
  const base = person(user, privateFields, includeCompliance);
  let role = base.role;
  if (role === "member" && (await isTeamMember(ctx, user))) {
    role = "admin";
  }
  return {
    ...base,
    role,
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
  try {
    assertTransition(shipment.status, status);
  } catch (err) {
    fail(err instanceof Error ? err.message : `Cannot transition parcel from ${shipment.status} to ${status}.`);
  }
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
    quote: safeQuoteFee(offer.feeNaira),
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
    senderVerified: sender?.verification === "verified" && !sender.suspended,
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
    quote: safeQuoteFee(shipment.feeNaira),
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
          handoverEvidenceIds: shipment.handoverEvidenceIds,
          deliveryEvidenceIds: shipment.deliveryEvidenceIds,
          receiverPickupSmsStatus: shipment.receiverPickupSmsStatus,
          receiverDeliverySmsStatus: shipment.receiverDeliverySmsStatus,
          deliveredAt: shipment.deliveredAt,
          latestLatitude: shipment.latestLatitude,
          latestLongitude: shipment.latestLongitude,
          latestLocationLabel: shipment.latestLocationLabel,
          latestLocationAt: shipment.latestLocationAt,
          latestSafetyCheckInAt: shipment.latestSafetyCheckInAt,
          disputeUntil: shipment.disputeUntil,
          exception: shipment.exception,
          cancellationReason: shipment.cancellationReason,
          refundApproved: shipment.refundApproved,
          releaseApproved: shipment.releaseApproved,
        }
      : {}),
  };
}
