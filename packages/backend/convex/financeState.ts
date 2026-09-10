import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { audit, fail, isAdmin, noOpenDispute, requireVerified, shipment, userBySubject } from "./lib";

export const operationKind = v.union(v.literal("payout"), v.literal("refund"));
export function operationDto(p: Doc<"payouts">) {
  return { operationId: p._id, shipmentId: p.shipmentId, paymentId: p.paymentId, kind: p.kind, reference: p.reference, amountKobo: p.amountKobo, currency: p.currency, status: p.status, providerStatus: p.providerStatus, lastError: p.lastError, createdAt: p.createdAt, updatedAt: p.updatedAt };
}
export async function financeAccess(ctx: QueryCtx | MutationCtx, sub: string, shipmentId: Id<"shipments">) {
  const user = await userBySubject(ctx, sub); const s = await shipment(ctx, shipmentId);
  if (s.senderId !== user._id && s.travellerId !== user._id && !isAdmin(user)) fail("Shipment participant or administrator access required.");
  return { user, s };
}
async function eligibility(ctx: MutationCtx, s: Doc<"shipments">, p: Doc<"payments">, kind: "payout" | "refund") {
  await noOpenDispute(ctx, s._id);
  if (p.status !== "paid" || !p.providerTransactionId) fail("Independently verified provider-paid funds are required.");
  const other = await ctx.db.query("payouts").withIndex("by_payment", q => q.eq("paymentId", p._id)).collect();
  if (other.some(o => o.kind !== kind && !["failed", "reversed"].includes(o.status))) fail("An opposite money operation already exists for these funds.");
  if (kind === "refund") {
    if (!s.refundApproved && !(p.quarantined && s.status === "cancelled")) fail("Refund requires explicit admin approval (or quarantined funds on a cancelled shipment).");
    if (s.paymentStatus === "released" && !p.quarantined) fail("Released funds cannot also be refunded.");
  } else {
    if (p.quarantined || !["held", "payout_pending", "payout_failed"].includes(s.paymentStatus)) fail("Payout requires held, non-quarantined provider-paid funds.");
    if (!s.travellerId || s.status === "cancelled" || s.refundApproved) fail("This shipment cannot be paid out.");
    if (!s.deliveredAt && !s.releaseApproved) fail("Receipt or explicit administrator release adjudication is required.");
    const adjudications = await ctx.db.query("disputes").withIndex("by_shipment", q => q.eq("shipmentId", s._id)).collect();
    const adjudicatedAt = Math.max(0, ...adjudications.filter(d => d.status === "resolved" && d.resolution === "release").map(d => d.resolvedAt ?? 0));
    const receiptAt = s.deliveredAt ?? (s.releaseApproved ? adjudicatedAt : 0);
    const eligibleAt = Math.max(s.disputeUntil ?? 0, receiptAt ? receiptAt + 24 * 60 * 60 * 1000 : 0);
    if (!eligibleAt || eligibleAt > Date.now()) fail("The 24-hour receipt/adjudication dispute window has not elapsed.");
    const traveller = await ctx.db.get(s.travellerId); if (!traveller) fail("Traveller unavailable."); requireVerified(traveller);
    const bank = await ctx.db.query("bankAccounts").withIndex("by_user", q => q.eq("userId", s.travellerId!)).unique();
    if (!bank?.recipientCode || !bank.verifiedAt) fail("Traveller must resolve and verify their bank recipient before payout.");
    return bank;
  }
}
export const bankOwner = internalQuery({ args: { subject: v.string() }, handler: async (ctx, args) => { const u = await userBySubject(ctx, args.subject); requireVerified(u); return { userId: u._id, name: u.name }; } });
export const saveBank = internalMutation({ args: { subject: v.string(), bankCode: v.string(), accountName: v.string(), last4: v.string(), recipientCode: v.string() }, handler: async (ctx, args) => {
  const u = await userBySubject(ctx, args.subject); requireVerified(u);
  const existing = await ctx.db.query("bankAccounts").withIndex("by_user", q => q.eq("userId", u._id)).unique();
  const data = { userId: u._id, bankCode: args.bankCode, accountName: args.accountName, last4: args.last4, recipientCode: args.recipientCode, currency: "NGN" as const, verifiedAt: Date.now(), updatedAt: Date.now() };
  if (existing) await ctx.db.patch(existing._id, data); else await ctx.db.insert("bankAccounts", data);
  await audit(ctx, u, "bank.recipient_verified", `Paystack resolved bank ${args.bankCode}, account ending ${args.last4}, and independently verified the transfer recipient. Full bank account number is not retained.`);
} });
export const prepare = internalMutation({ args: { subject: v.string(), shipmentId: v.id("shipments"), kind: operationKind, paymentId: v.optional(v.id("payments")) }, handler: async (ctx, args): Promise<Doc<"payouts">> => {
  const { user, s } = await financeAccess(ctx, args.subject, args.shipmentId); requireVerified(user);
  if (args.kind === "payout" ? s.travellerId !== user._id && !isAdmin(user) : s.senderId !== user._id && !isAdmin(user)) fail("This member cannot request this money operation.");
  const payments = await ctx.db.query("payments").withIndex("by_shipment", q => q.eq("shipmentId", s._id)).collect();
  const p = args.paymentId ? payments.find(p => p._id === args.paymentId) : payments.filter(p => p.status === "paid" && (args.kind === "refund" || !p.quarantined)).sort((a, b) => Number(!!b.quarantined) - Number(!!a.quarantined) || b.createdAt - a.createdAt)[0];
  if (!p) fail("No eligible provider-paid payment exists.");
  const existing = await ctx.db.query("payouts").withIndex("by_payment", q => q.eq("paymentId", p._id)).collect();
  const same = existing.filter(o => o.kind === args.kind).sort((a, b) => b.createdAt - a.createdAt)[0];
  if (same) return same;
  const bank = await eligibility(ctx, s, p, args.kind);
  const amountKobo = args.kind === "refund" ? p.amountKobo : p.travellerNetKobo ?? p.amountKobo - Math.round(p.amountKobo / 10);
  if (!Number.isSafeInteger(amountKobo) || amountKobo <= 0) fail("Invalid server finance amount.");
  const now = Date.now();
  const operationId = await ctx.db.insert("payouts", { shipmentId: s._id, paymentId: p._id, kind: args.kind, reference: "reserved", amountKobo, currency: "NGN", status: "prepared", actorId: user._id, recipientCode: bank?.recipientCode, providerTransactionId: p.providerTransactionId!, createdAt: now, updatedAt: now });
  const reference = `passenger-${operationId}`;
  await ctx.db.patch(operationId, { reference });
  await audit(ctx, user, `finance.${args.kind}_prepared`, `Provider operation ${reference} reserved for ${amountKobo} kobo. Payout is traveller net after the disclosed 10% platform fee.`, s._id);
  return (await ctx.db.get(operationId))!;
} });
export const authorizeOperation = internalQuery({ args: { subject: v.string(), operationId: v.id("payouts") }, handler: async (ctx, args) => {
  const op = await ctx.db.get(args.operationId); if (!op) fail("Finance operation not found.");
  await financeAccess(ctx, args.subject, op.shipmentId); return op;
} });
export const lookup = internalQuery({ args: { kind: operationKind, reference: v.optional(v.string()), providerId: v.optional(v.string()), providerTransactionId: v.optional(v.string()) }, handler: async (ctx, args) => {
  if (args.reference) { const op = await ctx.db.query("payouts").withIndex("by_reference", q => q.eq("reference", args.reference!)).unique(); if (op?.kind === args.kind) return op; }
  // Refund webhook carries provider refund/transaction IDs rather than our transfer reference.
  if (args.kind === "refund" && args.providerId) {
    const ops = await ctx.db.query("payouts").collect();
    const exact = ops.find(o => o.kind === "refund" && o.providerId === args.providerId); if (exact) return exact;
    const candidates = ops.filter(o => o.kind === "refund" && o.providerTransactionId === args.providerTransactionId && !o.providerId && ["pending", "uncertain"].includes(o.status));
    if (candidates.length === 1) return candidates[0];
  }
  return null;
} });
export const dispatch = internalMutation({ args: { operationId: v.id("payouts") }, handler: async (ctx, args) => {
  const op = await ctx.db.get(args.operationId); if (!op) fail("Finance operation not found.");
  if (op.status !== "prepared") return null;
  const s = await shipment(ctx, op.shipmentId); const p = await ctx.db.get(op.paymentId); if (!p) fail("Payment not found.");
  await eligibility(ctx, s, p, op.kind);
  await ctx.db.patch(op._id, { status: "pending", dispatchedAt: Date.now(), updatedAt: Date.now(), lastError: undefined });
  await ctx.db.patch(s._id, { paymentStatus: op.kind === "payout" ? "payout_pending" : "refund_pending", updatedAt: Date.now() });
  return op;
} });
export const uncertain = internalMutation({ args: { operationId: v.id("payouts") }, handler: async (ctx, args) => {
  const op = await ctx.db.get(args.operationId); if (!op || ["success", "failed", "reversed"].includes(op.status)) return;
  await ctx.db.patch(op._id, { status: "uncertain", lastError: "Provider outcome is uncertain. Reconcile this operation; do not initiate a duplicate.", updatedAt: Date.now() });
  await audit(ctx, null, "finance.provider_uncertain", `Unconfirmed ${op.kind} ${op.reference}; reference retained and blind retry blocked.`, op.shipmentId);
} });
export const attachProvider = internalMutation({ args: { operationId: v.id("payouts"), providerId: v.string() }, handler: async (ctx, args) => {
  const op = await ctx.db.get(args.operationId); if (!op) fail("Finance operation not found.");
  if (op.providerId && op.providerId !== args.providerId) fail("Provider operation ID mismatch.");
  await ctx.db.patch(op._id, { providerId: args.providerId });
} });
export const applyVerified = internalMutation({ args: { operationId: v.id("payouts"), providerId: v.string(), amountKobo: v.number(), currency: v.string(), providerStatus: v.string(), reference: v.optional(v.string()), recipientCode: v.optional(v.string()), providerTransactionId: v.optional(v.string()) }, handler: async (ctx, args) => {
  const op = await ctx.db.get(args.operationId); if (!op) fail("Finance operation not found.");
  if (args.amountKobo !== op.amountKobo || args.currency !== op.currency || op.providerId && op.providerId !== args.providerId) fail("Provider operation amount, currency or ID mismatch.");
  if (op.kind === "payout" && (args.reference !== op.reference || args.recipientCode !== op.recipientCode)) fail("Provider transfer reference/recipient mismatch.");
  if (op.kind === "refund" && args.providerTransactionId !== op.providerTransactionId) fail("Provider refund transaction mismatch.");
  const status = args.providerStatus === "success" || op.kind === "refund" && args.providerStatus === "processed" ? "success" : args.providerStatus === "failed" ? "failed" : args.providerStatus === "reversed" ? "reversed" : "pending";
  // Ignore stale pending/failed callbacks after settlement; independently verified reversal is meaningful.
  if (op.status === "success" && status !== "reversed") return operationDto(op);
  if (op.status === "reversed" && status !== "reversed") return operationDto(op);
  const now = Date.now();
  await ctx.db.patch(op._id, { status, providerId: args.providerId, providerStatus: args.providerStatus, verifiedAt: now, updatedAt: now, lastError: status === "failed" || status === "reversed" ? `Paystack reported ${args.providerStatus}.` : undefined });
  const s = await shipment(ctx, op.shipmentId);
  const all = await ctx.db.query("payouts").withIndex("by_shipment", q => q.eq("shipmentId", s._id)).collect();
  const conflicts = all.some(o => o._id !== op._id && o.paymentId === op.paymentId && o.status === "success");
  let paymentStatus: Doc<"shipments">["paymentStatus"] = op.kind === "payout" ? status === "success" ? "released" : status === "failed" || status === "reversed" ? "payout_failed" : "payout_pending" : status === "success" ? "refunded" : status === "failed" || status === "reversed" ? "reconciliation_required" : "refund_pending";
  const payments = await ctx.db.query("payments").withIndex("by_shipment", q => q.eq("shipmentId", s._id)).collect();
  // A refund for an extra late charge must not overwrite the legitimate payment's held/released status.
  if (op.kind === "refund" && status === "success") {
    const otherPaid = payments.filter(p => p._id !== op.paymentId && p.status === "paid");
    if (otherPaid.some(p => p.quarantined && !all.some(o => o.paymentId === p._id && o.kind === "refund" && o.status === "success"))) paymentStatus = "reconciliation_required";
    else if (otherPaid.some(p => !p.quarantined && !all.some(o => o.paymentId === p._id && o.kind === "refund" && o.status === "success"))) paymentStatus = all.some(o => o.kind === "payout" && o.status === "success") ? "released" : all.some(o => o.kind === "payout" && ["pending", "uncertain"].includes(o.status)) ? "payout_pending" : "held";
  }
  if (conflicts) paymentStatus = "reconciliation_required";
  await ctx.db.patch(s._id, { paymentStatus, updatedAt: now });
  await audit(ctx, null, `finance.${op.kind}_${status}`, `Independently verified Paystack ${op.kind} ${op.reference}, ${op.amountKobo} kobo, status ${args.providerStatus}.${conflicts ? " Conflicting successful operations require manual reconciliation." : ""}`, s._id);
  return operationDto((await ctx.db.get(op._id))!);
} });
export const prepareRetry = internalMutation({ args: { subject: v.string(), operationId: v.id("payouts") }, handler: async (ctx, args): Promise<Doc<"payouts">> => {
  const op = await ctx.db.get(args.operationId); if (!op) fail("Finance operation not found.");
  const { user, s } = await financeAccess(ctx, args.subject, op.shipmentId); requireVerified(user);
  if (op.kind === "payout" ? user._id !== s.travellerId && !isAdmin(user) : user._id !== s.senderId && !isAdmin(user)) fail("Not authorized to retry this operation.");
  if (op.status !== "failed" || !op.verifiedAt || Date.now() - op.verifiedAt > 60_000) fail("Only an independently verified failed operation may retry. Pending, reversed or uncertain operations require reconciliation.");
  const p = await ctx.db.get(op.paymentId); if (!p) fail("Payment not found."); await eligibility(ctx, s, p, op.kind);
  const others = await ctx.db.query("payouts").withIndex("by_payment", q => q.eq("paymentId", p._id)).collect();
  if (others.some(o => o._id !== op._id && !["failed", "reversed"].includes(o.status))) fail("Another operation already exists; reconcile it instead.");
  if (op.kind === "payout") {
    // Paystack transfer retries reuse the same idempotency reference and recipient.
    await ctx.db.patch(op._id, { status: "prepared", updatedAt: Date.now() });
    return (await ctx.db.get(op._id))!;
  }
  // Refunds have provider IDs, not client idempotency keys. Preserve the independently failed attempt.
  const now = Date.now();
  const id = await ctx.db.insert("payouts", { shipmentId: op.shipmentId, paymentId: op.paymentId, kind: "refund", reference: "reserved", amountKobo: op.amountKobo, currency: "NGN", status: "prepared", actorId: user._id, providerTransactionId: op.providerTransactionId, createdAt: now, updatedAt: now });
  await ctx.db.patch(id, { reference: `passenger-${id}` });
  await audit(ctx, user, "finance.refund_retry", `New refund attempt after independent terminal-failure verification of ${op.reference}.`, s._id);
  return (await ctx.db.get(id))!;
} });
