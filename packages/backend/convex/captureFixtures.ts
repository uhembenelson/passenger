import { createAccount } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { internalAction, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";

const email = "amara.okafor@example.com";

function developmentOnly() {
  if (process.env.CONVEX_CLOUD_URL !== "https://mellow-ox-83.convex.cloud") {
    throw new Error("Capture fixtures are restricted to the Passenger development deployment.");
  }
}

export const prepare = internalAction({
  args: { password: v.string() },
  returns: v.object({ email: v.string(), trips: v.number(), parcels: v.number() }),
  handler: async (ctx, args) => {
    developmentOnly();
    if (args.password.length < 16) throw new Error("Use a strong capture-account password.");
    const { user } = await createAccount(ctx, {
      provider: "password",
      account: { id: email, secret: args.password },
      profile: {
        email, subject: email, name: "Amara Okafor", phone: "",
        verification: "required", identityVerificationStatus: "unverified", joinedAt: Date.now(),
      },
      shouldLinkViaEmail: false,
      shouldLinkViaPhone: false,
    });
    return await ctx.runMutation(internal.captureFixtures.populate, { userId: user._id });
  },
});

export const populate = internalMutation({
  args: { userId: v.id("users") },
  returns: v.object({ email: v.string(), trips: v.number(), parcels: v.number() }),
  handler: async (ctx, args) => {
    developmentOnly();
    const user = await ctx.db.get(args.userId);
    if (user?.email !== email) throw new Error("Unexpected capture account.");
    const now = Date.now();
    const day = 86400000;
    const routes = [
      { origin: "Lagos", destination: "Abuja", stops: ["Ibadan"], capacityKg: 12 },
      { origin: "Abuja", destination: "Jos", stops: [], capacityKg: 8 },
    ];
    for (const [index, route] of routes.entries()) {
      const clientRequestId = `capture-fixture-route-${index}`;
      const existing = await ctx.db.query("trips").withIndex("by_traveller_request", q =>
        q.eq("travellerId", args.userId).eq("clientRequestId", clientRequestId)).unique();
      if (!existing) await ctx.db.insert("trips", {
        ...route, travellerId: args.userId, departureAt: now + (index + 2) * day,
        arrivalAt: now + (index + 2) * day + 8 * 3600000,
        reservedKg: 0, status: "active", clientRequestId,
        acceptedCategories: ["Documents", "Clothing", "Books"],
        handlingNotes: "Please pack items securely and arrange handover before departure.",
      });
    }
    const parcels = [
      { description: "Books for the new semester", category: "Books", weightKg: 2, valueNaira: 18000, receiverName: "Chidi Okafor" },
      { description: "Clothes and a birthday gift", category: "Clothing", weightKg: 3, valueNaira: 24000, receiverName: "Ada Okafor" },
    ];
    const existing = await ctx.db.query("shipments").withIndex("by_sender", q => q.eq("senderId", args.userId)).take(100);
    for (const [index, parcel] of parcels.entries()) {
      const reference = `PAX-26010${index + 1}`;
      if (!existing.some(row => row.reference === reference)) await ctx.db.insert("shipments", {
        ...parcel, reference, senderId: args.userId, origin: "Lagos", destination: "Abuja",
        receiverPhone: "", feeNaira: 4500 + index * 1000,
        status: "pending_review", paymentStatus: "unpaid", approved: false,
        reservationActive: false, createdAt: now - (index + 1) * 3600000, updatedAt: now,
        readyAt: now + day, deliveryDeadline: now + 5 * day,
        pickupInstructions: "Arrange a meeting point before collection.",
        dropoffInstructions: "Message the receiver before arrival.",
      });
    }
    const trips = await ctx.db.query("trips").withIndex("by_traveller", q => q.eq("travellerId", args.userId)).take(100);
    const shipments = await ctx.db.query("shipments").withIndex("by_sender", q => q.eq("senderId", args.userId)).take(100);
    return { email, trips: trips.length, parcels: shipments.length };
  },
});
