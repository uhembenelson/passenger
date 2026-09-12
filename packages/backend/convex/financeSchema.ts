import { defineTable } from "convex/server";
import { v } from "convex/values";

// Existing columns retain their original meaning. New columns are optional for live-data compatibility.
export const financeTables = {
  payments: defineTable({
    shipmentId: v.id("shipments"), reference: v.string(), amountKobo: v.number(), currency: v.literal("NGN"),
    status: v.union(v.literal("pending"), v.literal("paid"), v.literal("failed"), v.literal("abandoned"), v.literal("reconciliation_required")),
    url: v.optional(v.string()), createdAt: v.number(), paidAt: v.optional(v.number()), providerTransactionId: v.optional(v.string()),
    initializeState: v.optional(v.union(v.literal("inflight"), v.literal("ready"), v.literal("uncertain"), v.literal("rejected"))),
    verifiedAt: v.optional(v.number()), providerStatus: v.optional(v.string()), lastError: v.optional(v.string()),
    quarantined: v.optional(v.boolean()), supersededAt: v.optional(v.number()),
    platformFeeKobo: v.optional(v.number()), travellerNetKobo: v.optional(v.number()),
    tripId: v.optional(v.id("trips")), travellerId: v.optional(v.id("users")),
  }).index("by_reference", ["reference"]).index("by_shipment", ["shipmentId"]),
  reconciliations: defineTable({
    shipmentId: v.id("shipments"), externalReference: v.string(), kind: v.union(v.literal("refund"), v.literal("release")), actorId: v.id("users"), createdAt: v.number(),
    note: v.optional(v.string()), operationId: v.optional(v.id("payouts")), amountKobo: v.optional(v.number()),
  }).index("by_external_reference", ["externalReference"]).index("by_shipment", ["shipmentId"]),
  bankAccounts: defineTable({
    userId: v.id("users"), bankCode: v.string(), accountName: v.string(), last4: v.string(), recipientCode: v.string(),
    currency: v.literal("NGN"), verifiedAt: v.number(), updatedAt: v.number(),
  }).index("by_user", ["userId"]),
  payouts: defineTable({
    shipmentId: v.id("shipments"), paymentId: v.id("payments"), kind: v.union(v.literal("payout"), v.literal("refund")),
    reference: v.string(), amountKobo: v.number(), currency: v.literal("NGN"),
    status: v.union(v.literal("prepared"), v.literal("pending"), v.literal("success"), v.literal("failed"), v.literal("reversed"), v.literal("uncertain")),
    actorId: v.id("users"), recipientCode: v.optional(v.string()), providerId: v.optional(v.string()),
    providerTransactionId: v.string(), createdAt: v.number(), updatedAt: v.number(), dispatchedAt: v.optional(v.number()),
    verifiedAt: v.optional(v.number()), providerStatus: v.optional(v.string()), lastError: v.optional(v.string()),
  }).index("by_reference", ["reference"]).index("by_shipment", ["shipmentId"]).index("by_payment", ["paymentId"]),
};

import { fail } from "./lib";

export function feeQuote(feeNaira: number) {
  if (!Number.isSafeInteger(feeNaira) || feeNaira <= 0 || !Number.isSafeInteger(feeNaira * 100)) fail("Fee must be a positive whole-naira amount.");
  const grossKobo = feeNaira * 100;
  const platformFeeKobo = grossKobo / 10;
  return { grossKobo, platformFeeKobo, travellerNetKobo: grossKobo - platformFeeKobo, platformFeePercent: 10 as const };
}
