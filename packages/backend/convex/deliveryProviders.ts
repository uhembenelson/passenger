import { ConvexError, v } from "convex/values";
import { action, internalAction, internalQuery } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import { requireUser, shipmentDto, fail } from "./lib";
import { env } from "./_generated/server";
import { internal } from "./_generated/api";

const MAX_REASONABLE_DISTANCE_KM = 35;
const MAX_REASONABLE_WEIGHT_KG = 20;
const REQUEST_TIMEOUT_MS = 8_000;

type PublicShipment = Awaited<ReturnType<typeof shipmentDto>>;
type QuoteStatus = "available" | "unavailable" | "unsupported" | "error";

type DeliveryProviderQuote = {
  providerKey: string;
  providerName: string;
  status: QuoteStatus;
  reason?: string;
  mode?: "manual_link";
  serviceLevel?: string;
  currency?: "NGN";
  estimatedFeeNaira?: number;
  estimatedPickupEtaMinutes?: number;
  estimatedDropoffEtaMinutes?: number;
  bookingUrl?: string;
  notes?: string[];
};

type DeliveryProviderOptionsResponse = {
  shipment: {
    id: string;
    reference: string;
    origin: string;
    destination: string;
    category: string;
    weightKg: number;
    feeNaira: number;
    status: string;
    paymentStatus: string;
  };
  summary: {
    availableCount: number;
    evaluatedAt: number;
    currency: "NGN";
    bestEstimatedFeeNaira?: number;
  };
  quotes: DeliveryProviderQuote[];
};

function asObject(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function asNonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function asFiniteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function toErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ConvexError && typeof error.data === "string" && error.data.trim()) return error.data.trim();
  if (error instanceof Error && error.message.trim()) return error.message.trim();
  return fallback;
}

function normalizeLalamoveQuote(data: unknown): DeliveryProviderQuote {
  const obj = asObject(data);
  const amount = asFiniteNumber(obj?.totalFee);
  const distanceKm = asFiniteNumber(obj?.distanceKm);
  const notes = [
    distanceKm !== undefined ? `Approx. ${distanceKm.toFixed(1)} km road trip.` : undefined,
    asNonEmptyString(obj?.serviceLevel),
  ].filter((value): value is string => !!value);

  return {
    providerKey: "lalamove",
    providerName: "Lalamove",
    status: amount !== undefined ? "available" : "error",
    reason: amount === undefined ? "Provider quote was missing a total fee." : undefined,
    mode: amount !== undefined ? "manual_link" : undefined,
    serviceLevel: asNonEmptyString(obj?.serviceLevel) ?? "Motorbike",
    currency: amount !== undefined ? "NGN" : undefined,
    estimatedFeeNaira: amount,
    estimatedPickupEtaMinutes: asFiniteNumber(obj?.estimatedPickupEtaMinutes),
    estimatedDropoffEtaMinutes: asFiniteNumber(obj?.estimatedDropoffEtaMinutes),
    bookingUrl: amount !== undefined ? asNonEmptyString(obj?.bookingUrl) : undefined,
    notes,
  };
}

function buildManualBookingUrl(provider: string, shipment: PublicShipment): string {
  const params = new URLSearchParams({
    pickup: shipment.pickupInstructions ?? shipment.origin,
    dropoff: shipment.dropoffInstructions ?? shipment.destination,
    route: `${shipment.origin} to ${shipment.destination}`,
    receiver: shipment.receiverName,
    phone: shipment.receiverPhone,
    reference: shipment.reference,
  });
  return provider === "lalamove"
    ? `https://web.lalamove.com/ng/en-ng/?${params.toString()}`
    : `https://www.google.com/search?${new URLSearchParams({ q: `${provider} Lagos same day delivery` }).toString()}`;
}

async function loadShipmentForProvider(ctx: QueryCtx, shipmentId: string): Promise<PublicShipment> {
  const viewer = await requireUser(ctx);
  const normalizedId = ctx.db.normalizeId("shipments", shipmentId);
  if (!normalizedId) fail("Shipment not found.");
  const shipment = await ctx.db.get(normalizedId);
  if (!shipment) fail("Shipment not found.");
  if (shipment.senderId !== viewer._id && shipment.travellerId !== viewer._id) fail("Shipment participant access required.");
  return shipmentDto(ctx, shipment, true);
}

function localDeliveryEligibility(shipment: PublicShipment): string | null {
  if (!["open", "matched", "funded", "in_transit"].includes(shipment.status)) {
    return "External courier suggestions are only shown for active deliveries.";
  }
  if (shipment.weightKg > MAX_REASONABLE_WEIGHT_KG) {
    return `This parcel is above the ${MAX_REASONABLE_WEIGHT_KG} kg quick-delivery limit.`;
  }
  return null;
}

async function estimateLalamoveLikeQuote(shipment: PublicShipment): Promise<DeliveryProviderQuote> {
  const origin = shipment.origin.trim();
  const destination = shipment.destination.trim();
  const distanceResponse = await fetch(`https://router.project-osrm.org/route/v1/driving/${encodeURIComponent(origin)};${encodeURIComponent(destination)}?overview=false`, {
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    headers: { accept: "application/json" },
  });

  if (!distanceResponse.ok) {
    throw new Error("Could not estimate route distance.");
  }

  const data: unknown = await distanceResponse.json();
  const obj = asObject(data);
  const routes = Array.isArray(obj?.routes) ? obj.routes : [];
  const route = asObject(routes[0]);
  const meters = asFiniteNumber(route?.distance);
  const seconds = asFiniteNumber(route?.duration);
  if (meters === undefined) throw new Error("Route estimate was incomplete.");

  const distanceKm = Math.max(1, meters / 1000);
  if (distanceKm > MAX_REASONABLE_DISTANCE_KM) {
    return {
      providerKey: "lalamove",
      providerName: "Lalamove",
      status: "unsupported",
      reason: `Estimated route is about ${distanceKm.toFixed(1)} km, which is outside the local same-day delivery range we currently suggest.`,
      notes: ["Suitable for city and nearby intercity dispatch only."],
    };
  }

  const base = 2500;
  const perKm = shipment.weightKg <= 3 ? 220 : shipment.weightKg <= 10 ? 300 : 420;
  const estimatedFeeNaira = Math.ceil((base + distanceKm * perKm) / 100) * 100;
  const estimatedDropoffEtaMinutes = seconds !== undefined ? Math.max(20, Math.round(seconds / 60)) : Math.max(25, Math.round(distanceKm * 4));
  const estimatedPickupEtaMinutes = Math.min(90, Math.max(15, Math.round(estimatedDropoffEtaMinutes * 0.35)));

  return normalizeLalamoveQuote({
    totalFee: estimatedFeeNaira,
    distanceKm,
    estimatedPickupEtaMinutes,
    estimatedDropoffEtaMinutes,
    serviceLevel: shipment.weightKg <= 10 ? "Motorbike / small vehicle" : "Van",
    bookingUrl: buildManualBookingUrl("lalamove", shipment),
  });
}

export const getProviderOptions = action({
  args: { shipmentId: v.id("shipments") },
  returns: v.object({
    shipment: v.object({
      id: v.string(),
      reference: v.string(),
      origin: v.string(),
      destination: v.string(),
      category: v.string(),
      weightKg: v.number(),
      feeNaira: v.number(),
      status: v.string(),
      paymentStatus: v.string(),
    }),
    summary: v.object({
      availableCount: v.number(),
      evaluatedAt: v.number(),
      currency: v.literal("NGN"),
      bestEstimatedFeeNaira: v.optional(v.number()),
    }),
    quotes: v.array(v.object({
      providerKey: v.string(),
      providerName: v.string(),
      status: v.union(v.literal("available"), v.literal("unavailable"), v.literal("unsupported"), v.literal("error")),
      reason: v.optional(v.string()),
      mode: v.optional(v.literal("manual_link")),
      serviceLevel: v.optional(v.string()),
      currency: v.optional(v.literal("NGN")),
      estimatedFeeNaira: v.optional(v.number()),
      estimatedPickupEtaMinutes: v.optional(v.number()),
      estimatedDropoffEtaMinutes: v.optional(v.number()),
      bookingUrl: v.optional(v.string()),
      notes: v.optional(v.array(v.string())),
    })),
  }),
  handler: async (ctx, args): Promise<DeliveryProviderOptionsResponse> => {
    const shipment: PublicShipment = await ctx.runQuery(internal.deliveryProviders.getShipmentForProvider, { shipmentId: args.shipmentId });
    const blockedReason = localDeliveryEligibility(shipment);
    const evaluatedAt = Date.now();

    let quotes: DeliveryProviderQuote[];
    if (blockedReason) {
      quotes = [{
        providerKey: "lalamove",
        providerName: "Lalamove",
        status: "unsupported",
        reason: blockedReason,
        notes: ["No external provider suggestion available for this shipment right now."],
      }];
    } else {
      try {
        quotes = [await estimateLalamoveLikeQuote(shipment)];
      } catch (error) {
        quotes = [{
          providerKey: "lalamove",
          providerName: "Lalamove",
          status: "error",
          reason: toErrorMessage(error, "Could not look up delivery options right now."),
          notes: ["Try again later or book directly with a courier."],
        }];
      }
    }

    const available = quotes.filter((quote) => quote.status === "available");
    return {
      shipment: {
        id: shipment.id,
        reference: shipment.reference,
        origin: shipment.origin,
        destination: shipment.destination,
        category: shipment.category,
        weightKg: shipment.weightKg,
        feeNaira: shipment.feeNaira,
        status: shipment.status,
        paymentStatus: shipment.paymentStatus,
      },
      summary: {
        availableCount: available.length,
        evaluatedAt,
        currency: "NGN",
        bestEstimatedFeeNaira: available.length ? Math.min(...available.map((quote) => quote.estimatedFeeNaira ?? Number.POSITIVE_INFINITY).filter(Number.isFinite)) : undefined,
      },
      quotes,
    };
  },
});

export const getShipmentForProvider = internalQuery({
  args: { shipmentId: v.id("shipments") },
  returns: v.object({
    id: v.string(),
    reference: v.string(),
    senderId: v.string(),
    senderName: v.string(),
    senderVerified: v.optional(v.boolean()),
    travellerId: v.optional(v.string()),
    travellerName: v.optional(v.string()),
    origin: v.string(),
    destination: v.string(),
    description: v.string(),
    category: v.string(),
    weightKg: v.number(),
    valueNaira: v.number(),
    feeNaira: v.number(),
    receiverName: v.string(),
    receiverPhone: v.string(),
    status: v.string(),
    paymentStatus: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
    tripId: v.optional(v.string()),
    pickupInstructions: v.optional(v.string()),
    dropoffInstructions: v.optional(v.string()),
    readyAt: v.optional(v.number()),
    preferredPickupAt: v.optional(v.number()),
    pickupFlexBeforeMinutes: v.optional(v.number()),
    pickupFlexAfterMinutes: v.optional(v.number()),
    deliveryDeadline: v.optional(v.number()),
    evidenceIds: v.optional(v.array(v.string())),
    safetyConsent: v.optional(v.boolean()),
    reviewNote: v.optional(v.string()),
    payByAt: v.optional(v.number()),
    handoverAt: v.optional(v.number()),
    handoverEvidenceIds: v.optional(v.array(v.string())),
    deliveryEvidenceIds: v.optional(v.array(v.string())),
    receiverPickupSmsStatus: v.optional(v.union(v.literal("pending"), v.literal("sent"), v.literal("failed"))),
    receiverDeliverySmsStatus: v.optional(v.union(v.literal("pending"), v.literal("sent"), v.literal("failed"))),
    deliveredAt: v.optional(v.number()),
    latestLatitude: v.optional(v.number()),
    latestLongitude: v.optional(v.number()),
    latestLocationLabel: v.optional(v.string()),
    latestLocationAt: v.optional(v.number()),
    latestSafetyCheckInAt: v.optional(v.number()),
    locationCheckInCount: v.optional(v.number()),
    locationCheckInTarget: v.optional(v.number()),
    locationCheckInRemaining: v.optional(v.number()),
    missedLocationCheckIns: v.optional(v.number()),
    nextLocationCheckInAt: v.optional(v.number()),
    locationCheckInState: v.optional(v.union(v.literal("up_to_date"), v.literal("due_soon"), v.literal("overdue"), v.literal("complete"))),
    disputeUntil: v.optional(v.number()),
    exception: v.optional(v.string()),
    cancellationReason: v.optional(v.string()),
    refundApproved: v.optional(v.boolean()),
    releaseApproved: v.optional(v.boolean()),
    quote: v.optional(v.object({
      grossNaira: v.number(),
      grossKobo: v.number(),
      platformFeeKobo: v.number(),
      travellerNetKobo: v.number(),
      platformFeePercent: v.literal(10),
    })),
  }),
  handler: async (ctx, args) => {
    const shipment = await loadShipmentForProvider(ctx, args.shipmentId);
    return {
      ...shipment,
      evidenceIds: shipment.evidenceIds?.map(String),
      handoverEvidenceIds: shipment.handoverEvidenceIds?.map(String),
      deliveryEvidenceIds: shipment.deliveryEvidenceIds?.map(String),
    };
  },
});

export const healthcheck = internalAction({
  args: {},
  returns: v.object({ enabled: v.boolean(), provider: v.string(), siteUrlPresent: v.boolean() }),
  handler: async () => ({
    enabled: !!env.CONVEX_SITE_URL,
    provider: "lalamove_manual_estimate",
    siteUrlPresent: !!env.CONVEX_SITE_URL,
  }),
});
