import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { audit, fail, isAdmin, noOpenDispute, requireSender, requireVerified, shipment, userBySubject } from "./lib";
import { feeQuote } from "./financeSchema";

export const prepare = internalMutation({ args: { subject: v.string(), shipmentId: v.id("shipments"), reference: v.string(), retry: v.optional(v.boolean()) }, handler: async (ctx, args): Promise<{ paymentId: Id<"payments">; reference: string; amountKobo: number; url?: string; initialize: boolean }> => {
  const user = await userBySubject(ctx, args.subject); const s = await shipment(ctx, args.shipmentId); requireSender(s, user); requireVerified(user);
  await noOpenDispute(ctx, s._id);
  if (s.status !== "matched" || !["unpaid", "pending", "failed"].includes(s.paymentStatus) || !s.approved || !s.tripId || !s.travellerId || !s.reservationActive) fail("Only an approved, reserved, matched shipment can be paid.");
  const now = Date.now();
  if (s.payByAt !== undefined && s.payByAt <= now) fail("Payment deadline has expired. Do not pay an old checkout.");
  const trip = await ctx.db.get(s.tripId); if (!trip || trip.departureAt <= now) fail("The trip has already departed.");
  const traveller = await ctx.db.get(s.travellerId); if (!traveller) fail("Traveller unavailable."); requireVerified(traveller);
  const attempts = await ctx.db.query("payments").withIndex("by_shipment", q => q.eq("shipmentId", s._id)).collect();
  if (attempts.some(p => p.status === "paid")) fail("This shipment already has provider-paid funds. Contact finance.");
  const existing = attempts.filter(p => !p.supersededAt).sort((a, b) => b.createdAt - a.createdAt)[0];
  if (existing) {
    if (!["failed", "abandoned"].includes(existing.status)) return { paymentId: existing._id, reference: existing.reference, amountKobo: existing.amountKobo, url: existing.url, initialize: false };
    if (!args.retry || !existing.verifiedAt || now - existing.verifiedAt > 60_000) fail("Verify the previous failed payment using retry before creating another checkout.");
    await ctx.db.patch(existing._id, { supersededAt: now });
  }
  const quote = feeQuote(s.feeNaira);
  const paymentId = await ctx.db.insert("payments", { shipmentId: s._id, reference: args.reference, amountKobo: quote.grossKobo, platformFeeKobo: quote.platformFeeKobo, travellerNetKobo: quote.travellerNetKobo, currency: "NGN", status: "pending", initializeState: "inflight", createdAt: now, tripId: s.tripId, travellerId: s.travellerId });
  await ctx.db.patch(s._id, { paymentStatus: "pending", updatedAt: now });
  await audit(ctx, user, "payment.initialized", "Provider reference reserved once; uncertain initialization must be reconciled, not charged again.", s._id);
  return { paymentId, reference: args.reference, amountKobo: quote.grossKobo, initialize: true };
} });
export const attachUrl = internalMutation({ args: { paymentId: v.id("payments"), url: v.string() }, handler: async (ctx, args) => {
  const p = await ctx.db.get(args.paymentId); if (!p) fail("Payment not found.");
  await ctx.db.patch(p._id, { url: args.url, initializeState: "ready", lastError: undefined });
} });
export const initializeFailed = internalMutation({ args: { paymentId: v.id("payments") }, handler: async (ctx, args) => {
  const p = await ctx.db.get(args.paymentId); if (!p || p.status === "paid" || p.url) return;
  await ctx.db.patch(p._id, { initializeState: "uncertain", lastError: "Checkout initialization was not confirmed. Reconcile this reference before another charge." });
  await audit(ctx, null, "payment.initialize_uncertain", "Provider request did not produce a confirmed checkout. Reference preserved.", p.shipmentId);
} });
export const forReconcile = internalQuery({ args: { subject: v.string(), shipmentId: v.id("shipments") }, handler: async (ctx, args) => {
  const u = await userBySubject(ctx, args.subject); const s = await shipment(ctx, args.shipmentId);
  if (s.senderId !== u._id && !isAdmin(u)) fail("Sender or administrator access required.");
  const attempts = await ctx.db.query("payments").withIndex("by_shipment", q => q.eq("shipmentId", s._id)).collect();
  return attempts.sort((a, b) => b.createdAt - a.createdAt).map(p => ({ reference: p.reference, amountKobo: p.amountKobo, status: p.status, superseded: !!p.supersededAt }));
} });
export const recordVerification = internalMutation({ args: { reference: v.string(), providerStatus: v.string(), amountKobo: v.number(), currency: v.string() }, handler: async (ctx, args) => {
  const p = await ctx.db.query("payments").withIndex("by_reference", q => q.eq("reference", args.reference)).first(); if (!p) return;
  if (args.amountKobo !== p.amountKobo || args.currency !== p.currency) fail("Provider payment amount/currency mismatch.");
  if (p.status === "paid") return;
  const status = args.providerStatus === "failed" ? "failed" : args.providerStatus === "abandoned" ? "abandoned" : "pending";
  await ctx.db.patch(p._id, { status, providerStatus: args.providerStatus, verifiedAt: Date.now(), lastError: undefined });
  const s = await shipment(ctx, p.shipmentId);
  if (!p.supersededAt && s.status === "matched" && ["unpaid", "pending", "failed"].includes(s.paymentStatus)) await ctx.db.patch(s._id, { paymentStatus: status === "pending" ? "pending" : "failed", updatedAt: Date.now() });
} });
export const confirmPaid = internalMutation({ args: { reference: v.string(), amountKobo: v.number(), currency: v.string(), providerTransactionId: v.string() }, handler: async (ctx, args): Promise<{ accepted: boolean; quarantined?: boolean }> => {
  const payment = await ctx.db.query("payments").withIndex("by_reference", q => q.eq("reference", args.reference)).first();
  if (!payment) return { accepted: false };
  if (args.currency !== payment.currency || !Number.isSafeInteger(args.amountKobo) || args.amountKobo !== payment.amountKobo) fail("Provider payment amount/currency mismatch.");
  if (payment.status === "paid") { if (payment.providerTransactionId !== args.providerTransactionId) fail("Provider transaction does not match the settled reference."); return { accepted: true, quarantined: !!payment.quarantined }; }
  const s = await shipment(ctx, payment.shipmentId); const now = Date.now();
  const trip = s.tripId ? await ctx.db.get(s.tripId) : null;
  const disputes = await ctx.db.query("disputes").withIndex("by_shipment", q => q.eq("shipmentId", s._id)).collect();
  const previousMatched = s.status === "disputed" && disputes.some(d => d.status === "open" && d.previousStatus === "matched");
  const canApply = !payment.supersededAt && s.feeNaira * 100 === payment.amountKobo && ["unpaid", "pending", "failed"].includes(s.paymentStatus) && (s.status === "matched" || previousMatched) && s.reservationActive && !!trip && trip.departureAt > now && (s.payByAt === undefined || s.payByAt > now) && (!payment.tripId || payment.tripId === s.tripId) && (!payment.travellerId || payment.travellerId === s.travellerId);
  await ctx.db.patch(payment._id, { status: "paid", paidAt: now, verifiedAt: now, providerStatus: "success", providerTransactionId: args.providerTransactionId, quarantined: !canApply, lastError: undefined });
  if (canApply) await ctx.db.patch(s._id, { paymentStatus: "held", status: s.status === "matched" ? "funded" : s.status, updatedAt: now });
  else if (!["released", "refunded"].includes(s.paymentStatus)) await ctx.db.patch(s._id, { paymentStatus: "reconciliation_required", updatedAt: now });
  await audit(ctx, null, canApply ? "payment.provider_confirmed" : "payment.late_funds_quarantined", canApply ? "Paystack independently verified the server reference, amount and NGN currency. Provider-paid funds are not an internal wallet or regulated escrow." : "Late, duplicate or incompatible funds quarantined for real refund/reconciliation. Shipment lifecycle and cancelled state were not changed.", s._id);
  return { accepted: true, quarantined: !canApply };
} });
