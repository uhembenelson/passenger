import { describe, expect, test } from "bun:test";
import { ALLOWED_TRANSITIONS, assertTransition, calculateDeliveryFee, findMatchingTrips, formatErrorMessage, matchExplanation, money, normalizeCity, routeMatches, validateShipment, validateTrip } from "./index";
import type { CreateShipmentInput, CreateTripInput } from "./index";

const shipment: CreateShipmentInput = { origin: "Jos", destination: "Abuja", description: "Sealed university documents", category: "Documents", weightKg: 2, valueNaira: 20000, receiverName: "Chidi", receiverPhone: "+2348030000107", pickupInstructions: "Meet at the main gate by the security desk.", dropoffInstructions: "Call on arrival and meet at the reception.", readyAt: 1500, deliveryDeadline: 2500, evidenceIds: ["evidence-1"], safetyConsent: true };
const trip: CreateTripInput = { origin: "Jos", destination: "Abuja", stops: [], departureAt: 2000, arrivalAt: 2600, capacityKg: 10 };

describe("package declarations", () => {
  test("accepts a complete declaration", () => expect(() => validateShipment(shipment, 1000)).not.toThrow());
  for (const weightKg of [0, -1, NaN, Infinity, 25.01]) test(`rejects weight ${weightKg}`, () => expect(() => validateShipment({ ...shipment, weightKg })).toThrow());
  test("rejects value above service limit", () => expect(() => validateShipment({ ...shipment, valueNaira: 500001 })).toThrow());
  test("rejects same city despite casing or spaces", () => expect(() => validateShipment({ ...shipment, destination: " JOS " })).toThrow());
  test("requires contents", () => expect(() => validateShipment({ ...shipment, description: "bag" })).toThrow());
  test("requires category", () => expect(() => validateShipment({ ...shipment, category: "Unreviewed" })).toThrow());
  test("requires receiver phone", () => expect(() => validateShipment({ ...shipment, receiverPhone: "wrong" })).toThrow());
  test("rejects punctuation-only receiver phones", () => expect(() => validateShipment({ ...shipment, receiverPhone: "((((((((((" })).toThrow());
  test("rejects spaces-only receiver phones", () => expect(() => validateShipment({ ...shipment, receiverPhone: "            " })).toThrow());
  test("requires bounded receiver name", () => expect(() => validateShipment({ ...shipment, receiverName: "x".repeat(121) })).toThrow());
  test("calculates a route and category based delivery fee", () => {
    expect(calculateDeliveryFee({ origin: "Jos", destination: "Abuja", category: "Clothing" })).toBe(5100);
    expect(calculateDeliveryFee({ origin: "Jos", destination: "Lagos", category: "Electronics" })).toBeGreaterThan(calculateDeliveryFee({ origin: "Jos", destination: "Abuja", category: "Documents" }));
  });
});

describe("journeys and matching", () => {
  test("valid future trip", () => expect(() => validateTrip(trip, 1000)).not.toThrow());
  test("rejects a past trip", () => expect(() => validateTrip(trip, 3000)).toThrow());
  test("rejects trips too far ahead", () => expect(() => validateTrip({ ...trip, departureAt: 100 * 86400000 }, 1000)).toThrow());
  test("rejects invalid capacity", () => expect(() => validateTrip({ ...trip, capacityKg: Infinity }, 1000)).toThrow());
  test("normalizes city names", () => expect(normalizeCity("  JOS ")).toBe("jos"));
  test("route direction matters", () => expect(routeMatches(shipment, { origin: "Abuja", destination: "Jos" })).toBe(false));
  test("rejects unverified, past, undersized and wrong-route matches", () => {
    const base = { id: "base", travellerId: "traveller-1", travellerName: "Traveller One", origin: "Jos", destination: "Abuja", stops: [], departureAt: 2000, arrivalAt: 2400, capacityKg: 8, verified: true, status: "active" as const };
    const trips = [
      { ...base, id: "valid", departureAt: 2000 },
      { ...base, id: "earlier", departureAt: 1500 },
      { ...base, id: "past", departureAt: 999 },
      { ...base, id: "small", capacityKg: 1, departureAt: 2000 },
      { ...base, id: "unverified", verified: false, departureAt: 2000 },
      { ...base, id: "wrong", destination: "Lagos", departureAt: 2000 },
    ];
    expect(findMatchingTrips(shipment, trips, 1000).map(t => t.id)).toEqual(["earlier", "valid"]);
  });
  test("matches carrying preferences and ranks the closest pickup first", () => {
    const flexible = { ...shipment, preferredPickupAt: 2000, pickupFlexBeforeMinutes: 1, pickupFlexAfterMinutes: 1, readyAt: 1000, deliveryDeadline: 4000 };
    const base = { travellerId: "traveller-1", travellerName: "Traveller One", origin: "Jos", destination: "Abuja", stops: [], arrivalAt: 3000, capacityKg: 8, maxParcelWeightKg: 3, acceptedCategories: ["Documents"], verified: true, status: "active" as const };
    const trips = [{ ...base, id: "later", departureAt: 2500 }, { ...base, id: "closest", departureAt: 2050 }, { ...base, id: "wrong-category", departureAt: 2000, acceptedCategories: ["Books"] }];
    expect(findMatchingTrips(flexible, trips, 1000).map(item => item.id)).toEqual(["closest", "later"]);
    expect(matchExplanation(flexible, trips[0]!)).toContain("after your preferred pickup");
  });
  test("rejects a parcel above the traveller's per-parcel limit", () => {
    expect(findMatchingTrips(shipment, [{ id: "small-limit", travellerId: "traveller-1", travellerName: "Traveller One", origin: "Jos", destination: "Abuja", stops: [], departureAt: 2000, arrivalAt: 2400, capacityKg: 8, maxParcelWeightKg: 1, acceptedCategories: ["Documents"], verified: true, status: "active" }], 1000)).toEqual([]);
  });
});

describe("delivery lifecycle", () => {
  test("permits review -> match -> payment -> handover -> receipt", () => {
    for (const [from, to] of [["pending_review", "open"], ["open", "matched"], ["matched", "funded"], ["funded", "in_transit"], ["in_transit", "delivered"]] as const) expect(() => assertTransition(from, to)).not.toThrow();
  });
  test("cannot skip payment or receiver confirmation", () => {
    expect(() => assertTransition("matched", "in_transit")).toThrow();
    expect(() => assertTransition("funded", "delivered")).toThrow();
  });
  test("disputes require privileged resolution", () => expect(ALLOWED_TRANSITIONS.disputed).toEqual([]));
  test("cancellation is terminal", () => expect(ALLOWED_TRANSITIONS.cancelled).toEqual([]));
  test("allows cancelling funded shipments before handover", () => expect(() => assertTransition("funded", "cancelled")).not.toThrow());
  test("delivered disputes remain possible before payout", () => expect(() => assertTransition("delivered", "disputed")).not.toThrow());
});

describe("presentation helpers", () => {
  test("formats naira", () => expect(money(4500)).toBe("₦4,500"));
});

describe("error message formatting", () => {
  test("strips raw convex markers and stack traces", () => {
    const raw = "[CONVEX M(deliveries:confirmDelivery)] [Request ID: 12345] Server Error\nUncaught ConvexError: Enter the 6-digit code.\n  at handler (packages/backend/convex/deliveries.ts:50:11)\n  Called by client";
    expect(formatErrorMessage(raw)).toBe("Enter the 6-digit code.");
  });

  test("unwraps ConvexError data payloads", () => {
    const errorWithData = { data: "Trip cancelled: Weather delay" };
    expect(formatErrorMessage(errorWithData)).toBe("Trip cancelled: Weather delay");
  });

  test("masks server/database errors with friendly message", () => {
    const serverErr = new Error("[CONVEX Q(shipments:get)] Server Error: internal server error");
    expect(formatErrorMessage(serverErr)).toBe("Passenger is temporarily unavailable. Please try again shortly.");
  });

  test("masks network/timeout failures with connection message", () => {
    const netErr = new Error("Failed to fetch: connection timeout");
    expect(formatErrorMessage(netErr)).toBe("We couldn't connect. Your information is safe. Please check your connection and try again.");
  });

  test("falls back on empty or unrecognized internal error", () => {
    expect(formatErrorMessage(null)).toBe("We couldn't finish that. Please try again.");
    expect(formatErrorMessage("")).toBe("We couldn't finish that. Please try again.");
  });
});
