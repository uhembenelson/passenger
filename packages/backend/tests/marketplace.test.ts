import { beforeEach, describe, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "../convex/schema";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";

const modules = import.meta.glob("../convex/**/*.ts");

const identity = (subject: string) => ({
  subject,
  issuer: "https://clerk.test",
  tokenIdentifier: `https://clerk.test|${subject}`,
  email: `${subject}@example.com`,
});

const baseShipmentInput = {
  origin: "Jos",
  destination: "Abuja",
  description: "Electronics cable in box",
  category: "Electronics",
  weightKg: 2,
  valueNaira: 15000,
  receiverName: "Receiver Test",
  receiverPhone: "+2348012345678",
  pickupInstructions: "Meet at gate",
  dropoffInstructions: "Deliver at reception",
  readyAt: Date.now() + 60_000,
  preferredPickupAt: Date.now() + 86_400_000,
  pickupFlexBeforeMinutes: 120,
  pickupFlexAfterMinutes: 120,
  deliveryDeadline: Date.now() + 3 * 86_400_000,
  safetyConsent: true,
};

beforeEach(() => {
  vi.stubEnv("ADMIN_CLERK_SUBJECTS", "admin");
  vi.stubEnv("PAYSTACK_SECRET_KEY", "sk_test_backend_only");
  vi.stubEnv("TERMII_API_KEY", "AC123456789");
  vi.stubEnv("TERMII_SENDER_ID", "Passenger");
  vi.stubEnv("TERMII_CHANNEL", "generic");
  vi.unstubAllGlobals();
});

async function createEvidence(
  user: ReturnType<ReturnType<typeof convexTest>["withIdentity"]>,
  userId: Id<"users">,
  name: string,
) {
  return user.run(async ctx => {
    const bytes = `evidence-${name}`;
    const storageId = await ctx.storage.store(new Blob([bytes], { type: "image/jpeg" }));
    return ctx.db.insert("evidence", {
      ownerId: userId,
      storageId,
      purpose: "parcel",
      filename: `evidence-${name}.jpg`,
      contentType: "image/jpeg",
      size: bytes.length,
      createdAt: Date.now(),
    });
  });
}

async function marketplaceFixture() {
  const t = convexTest(schema, modules);
  const admin = t.withIdentity(identity("admin"));
  const sender = t.withIdentity(identity("sender"));
  const traveller1 = t.withIdentity(identity("traveller1"));
  const traveller2 = t.withIdentity(identity("traveller2"));

  const a = await admin.mutation(api.accounts.ensureProfile, { name: "Admin", phone: "+2348000000001" });
  const s = await sender.mutation(api.accounts.ensureProfile, { name: "Sender User", phone: "+2348000000002" });
  const tr1 = await traveller1.mutation(api.accounts.ensureProfile, { name: "Traveller One", phone: "+2348000000003" });
  const tr2 = await traveller2.mutation(api.accounts.ensureProfile, { name: "Traveller Two", phone: "+2348000000004" });

  for (const user of [s, tr1, tr2]) {
    await admin.mutation(api.admin.reviewUser, {
      userId: user.id as Id<"users">,
      decision: "verified",
      note: "Verified for marketplace testing.",
    });
  }

  await t.run(ctx => ctx.db.patch(s.id as Id<"users">, { walletBalanceNaira: 100000, walletVerifiedBalanceNaira: 100000 }));

  const evidenceId = await createEvidence(sender, s.id as Id<"users">, "parcel-evidence");
  const shipmentId = await sender.mutation(api.marketplace.createShipment, {
    ...baseShipmentInput,
    evidenceIds: [evidenceId],
  });
  await admin.mutation(api.admin.reviewShipment, {
    shipmentId,
    decision: "approve",
    note: "Parcel approved.",
  });

  const trip1Id = await traveller1.mutation(api.marketplace.createTrip, {
    origin: "Jos",
    destination: "Abuja",
    stops: [],
    departureAt: Date.now() + 86400000,
    arrivalAt: Date.now() + 2 * 86400000,
    capacityKg: 10,
    maxParcelWeightKg: 5,
    acceptedCategories: ["Electronics", "Clothing"],
  });

  const trip2Id = await traveller2.mutation(api.marketplace.createTrip, {
    origin: "Jos",
    destination: "Abuja",
    stops: ["Kaduna"],
    departureAt: Date.now() + 86400000 + 3600000,
    arrivalAt: Date.now() + 2 * 86400000,
    capacityKg: 8,
    maxParcelWeightKg: 5,
    acceptedCategories: ["Electronics"],
  });

  return {
    t,
    admin,
    sender,
    traveller1,
    traveller2,
    senderId: s.id as Id<"users">,
    traveller1Id: tr1.id as Id<"users">,
    traveller2Id: tr2.id as Id<"users">,
    shipmentId,
    trip1Id,
    trip2Id,
  };
}

describe("marketplace matching queries", () => {
  it("paginates sent parcel history beyond the dashboard limit without exposing other senders", async () => {
    const f = await marketplaceFixture();
    await f.sender.run(async ctx => {
      const original = await ctx.db.get(f.shipmentId);
      if (!original) throw new Error("Missing fixture parcel");
      const { _id, _creationTime, ...parcel } = original;
      for (let index = 0; index < 201; index++) {
        await ctx.db.insert("shipments", { ...parcel, reference: `HISTORY-${index}`, status: index % 2 ? "delivered" : "cancelled" });
      }
    });
    const ids: string[] = [];
    let cursor: string | null = null;
    let done = false;
    while (!done) {
      const result: { page: Array<{ id: string }>; continueCursor: string; isDone: boolean } = await f.sender.query(api.marketplace.mySentParcelsPage, { paginationOpts: { numItems: 30, cursor } });
      ids.push(...result.page.map(parcel => parcel.id));
      cursor = result.continueCursor;
      done = result.isDone;
    }
    expect(ids).toHaveLength(202);
    expect(new Set(ids).size).toBe(202);
    expect(ids.at(-1)).toBe(f.shipmentId);
    const otherSender = await f.traveller1.query(api.marketplace.mySentParcelsPage, { paginationOpts: { numItems: 30, cursor: null } });
    expect(otherSender.page).toEqual([]);
    const unauthenticated = convexTest(schema, modules);
    await expect(unauthenticated.query(api.marketplace.mySentParcelsPage, { paginationOpts: { numItems: 30, cursor: null } })).rejects.toThrow();
  });

  it("returns ranked compatible trips for a sender parcel", async () => {
    const f = await marketplaceFixture();

    const matches = await f.sender.query(api.offers.matchingTripsForShipment, {
      shipmentId: f.shipmentId,
    });

    expect(matches.length).toBe(2);
    expect(matches[0].trip.id).toBe(f.trip1Id);
    expect(matches[0].segment).toEqual({ pickupIndex: 0, dropoffIndex: 1 });
    expect(matches[0].availableKgOnSegment).toBe(10);
    expect(matches[0].explanation).toContain("direct route");

    expect(matches[1].trip.id).toBe(f.trip2Id);
    expect(matches[1].availableKgOnSegment).toBe(8);
  });

  it("returns ranked compatible parcels for a traveller trip", async () => {
    const f = await marketplaceFixture();

    const matches = await f.traveller1.query(api.offers.matchingShipmentsForTrip, {
      tripId: f.trip1Id,
    });

    expect(matches.length).toBe(1);
    expect(matches[0].shipment.id).toBe(f.shipmentId);
    expect(matches[0].availableKgOnSegment).toBe(10);
    expect(matches[0].explanation).toBeDefined();
  });
});

describe("marketplace offer notifications lifecycle", () => {
  it("notifies superseded travellers when sender accepts an offer", async () => {
    const f = await marketplaceFixture();

    // Both travellers propose offers
    const offer1Id = await f.traveller1.mutation(api.offers.propose, {
      shipmentId: f.shipmentId,
      tripId: f.trip1Id,
      expiresAt: Date.now() + 3600000,
      note: "Offer 1",
    });

    const offer2Id = await f.traveller2.mutation(api.offers.propose, {
      shipmentId: f.shipmentId,
      tripId: f.trip2Id,
      expiresAt: Date.now() + 3600000,
      note: "Offer 2",
    });

    // Sender accepts Traveller 1's offer
    await f.sender.mutation(api.offers.accept, { offerId: offer1Id });

    // Traveller 2's offer should be declined
    const offer2 = await f.t.run(ctx => ctx.db.get(offer2Id));
    expect(offer2?.status).toBe("declined");

    // Traveller 2 should have received a notification
    const tr2Notifications = await f.t.run(ctx =>
      ctx.db.query("notifications").withIndex("by_user", q => q.eq("userId", f.traveller2Id)).collect(),
    );
    expect(tr2Notifications.some(n => n.title === "Offer superseded")).toBe(true);
  });

  it("notifies sender when traveller withdraws an offer", async () => {
    const f = await marketplaceFixture();

    const offerId = await f.traveller1.mutation(api.offers.propose, {
      shipmentId: f.shipmentId,
      tripId: f.trip1Id,
      expiresAt: Date.now() + 3600000,
      note: "Will withdraw soon",
    });

    await f.traveller1.mutation(api.offers.withdraw, { offerId });

    const senderNotifications = await f.t.run(ctx =>
      ctx.db.query("notifications").withIndex("by_user", q => q.eq("userId", f.senderId)).collect(),
    );
    expect(senderNotifications.some(n => n.title === "Offer withdrawn")).toBe(true);
  });

  it("notifies sender when traveller cancels trip with pending offers", async () => {
    const f = await marketplaceFixture();

    await f.traveller1.mutation(api.offers.propose, {
      shipmentId: f.shipmentId,
      tripId: f.trip1Id,
      expiresAt: Date.now() + 3600000,
      note: "Pending offer",
    });

    await f.traveller1.mutation(api.journeys.cancel, {
      tripId: f.trip1Id,
      reason: "Car breakdown, trip cancelled",
    });

    const senderNotifications = await f.t.run(ctx =>
      ctx.db.query("notifications").withIndex("by_user", q => q.eq("userId", f.senderId)).collect(),
    );
    expect(senderNotifications.some(n => n.title === "Offer withdrawn")).toBe(true);
  });
});

describe("public marketplace profile", () => {
  it("returns contextual tripSummary when tripId is provided and hides private details", async () => {
    const f = await marketplaceFixture();

    const profile = await f.sender.query(api.marketplaceProfiles.publicProfile, {
      userId: f.traveller1Id,
      tripId: f.trip1Id,
    });

    expect(profile).toBeDefined();
    expect(profile?.name).toBe("Traveller One");
    expect(profile?.verification).toBe("verified");
    expect(profile?.tripSummary).toBeDefined();
    expect(profile?.tripSummary?.origin).toBe("Jos");
    expect(profile?.tripSummary?.destination).toBe("Abuja");
    expect(profile?.tripSummary?.capacityKg).toBe(10);
    // Never expose phone numbers or identity documents
    expect((profile as any).phone).toBeUndefined();
    expect((profile as any).identityEvidenceIds).toBeUndefined();
  });
});
