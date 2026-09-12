import { v } from "convex/values";
import { action, internalAction, query } from "./_generated/server";
import type { ActionCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { fail, requireUser, subject } from "./lib";
import { feeQuote } from "./financeSchema";
import { financeAccess, operationDto, operationKind } from "./financeState";

function secret() { const key = process.env.PAYSTACK_SECRET_KEY; if (!key) fail("Live Paystack banking and finance are not configured. No simulated transfer is available."); return key; }
async function provider(path: string, init?: RequestInit): Promise<any> {
  let response: Response;
  try {
    response = await fetch(`https://api.paystack.co${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${secret()}`, "Content-Type": "application/json", ...init?.headers },
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    fail("We could not connect to Paystack. Please check your connection and try again.");
  }
  if (!response.ok) fail("Paystack could not confirm this request. Reconcile existing operations before retrying.");
  let body: any;
  try {
    body = await response.json();
  } catch {
    fail("Paystack returned an invalid response.");
  }
  if (body?.status !== true || body.data == null) fail("Paystack returned an unconfirmed response.");
  return body.data;
}
export const quote = query({ args: { feeNaira: v.number() }, handler: async (ctx, args) => { await requireUser(ctx); return feeQuote(args.feeNaira); } });
export const bankAccount = query({ args: {}, handler: async (ctx) => {
  const u = await requireUser(ctx); const bank = await ctx.db.query("bankAccounts").withIndex("by_user", q => q.eq("userId", u._id)).first();
  return bank ? { accountName: bank.accountName, bankCode: bank.bankCode, last4: bank.last4, ready: !!bank.recipientCode, verifiedAt: bank.verifiedAt } : null;
} });
export const history = query({ args: { shipmentId: v.id("shipments") }, handler: async (ctx, args) => {
  await financeAccess(ctx, await subject(ctx), args.shipmentId);
  return (await ctx.db.query("payouts").withIndex("by_shipment", q => q.eq("shipmentId", args.shipmentId)).collect()).sort((a, b) => b.createdAt - a.createdAt).map(operationDto);
} });
export const banks = action({ args: {}, handler: async (ctx): Promise<Array<{ code: string; name: string }>> => {
  await ctx.runQuery(internal.financeState.bankOwner, { subject: await subject(ctx) });
  const data = await provider("/bank?currency=NGN&type=nuban&perPage=100");
  if (!Array.isArray(data)) fail("Invalid Paystack bank directory.");
  return data.filter(b => typeof b.code === "string" && typeof b.name === "string" && b.active !== false).map(b => ({ code: b.code, name: b.name }));
} });
export const setupBank = action({ args: { bankCode: v.string(), accountNumber: v.string() }, handler: async (ctx, args): Promise<{ accountName: string; bankCode: string; last4: string; ready: boolean }> => {
  const sub = await subject(ctx); await ctx.runQuery(internal.financeState.bankOwner, { subject: sub });
  if (!/^\d{3,10}$/.test(args.bankCode) || !/^\d{10}$/.test(args.accountNumber)) fail("Choose a bank and provide a valid 10-digit Nigerian account number.");
  const resolved = await provider(`/bank/resolve?account_number=${encodeURIComponent(args.accountNumber)}&bank_code=${encodeURIComponent(args.bankCode)}`);
  if (resolved.account_number !== args.accountNumber || typeof resolved.account_name !== "string" || !resolved.account_name.trim()) fail("Paystack could not resolve these bank details.");
  const recipient = await provider("/transferrecipient", { method: "POST", body: JSON.stringify({ type: "nuban", name: resolved.account_name, account_number: args.accountNumber, bank_code: args.bankCode, currency: "NGN" }) });
  if (typeof recipient.recipient_code !== "string") fail("Paystack did not create a transfer recipient.");
  const verified = await provider(`/transferrecipient/${encodeURIComponent(recipient.recipient_code)}`);
  if (verified.recipient_code !== recipient.recipient_code || verified.active !== true || verified.currency !== "NGN" || verified.type !== "nuban" || verified.details?.account_number !== args.accountNumber || verified.details?.bank_code !== args.bankCode) fail("Paystack recipient details did not independently match the resolved bank account.");
  const result = { accountName: resolved.account_name.trim(), bankCode: args.bankCode, last4: args.accountNumber.slice(-4), ready: true };
  await ctx.runMutation(internal.financeState.saveBank, { subject: sub, bankCode: result.bankCode, accountName: result.accountName, last4: result.last4, recipientCode: recipient.recipient_code });
  return result;
} });

async function verifiedOperation(ctx: ActionCtx, op: Doc<"payouts">, refundId?: string): Promise<ReturnType<typeof operationDto>> {
  let data: any;
  if (op.kind === "payout") data = await provider(`/transfer/verify/${encodeURIComponent(op.reference)}`);
  else {
    let id = op.providerId ?? refundId;
    if (!id) {
      // Refund create has no client idempotency key. Recover only an exact unique merchant-note match.
      // Bounded listing is safe: absence never authorizes resending an uncertain refund.
      const matches: any[] = [];
      for (let page = 1; page <= 10; page++) {
        const list = await provider(`/refund?perPage=100&page=${page}`);
        if (!Array.isArray(list)) fail("Invalid provider refund reconciliation response.");
        for (const item of list) if (item.merchant_note === op.reference) matches.push(item);
        if (list.length < 100) break;
      }
      if (matches.length !== 1 || matches[0].id === undefined) fail("Refund has no uniquely verifiable provider ID yet. Keep this operation pending; ask support to reconcile externally if needed.");
      id = String(matches[0].id);
    }
    data = await provider(`/refund/${encodeURIComponent(id)}`);
    if (String(data.id) !== id || !op.providerId && data.merchant_note !== op.reference) fail("Provider refund does not match this operation.");
  }
  const providerId = op.kind === "payout" ? data.transfer_code : data.id;
  if (typeof providerId !== "string" && typeof providerId !== "number" || !Number.isSafeInteger(data.amount) || typeof data.status !== "string" || data.currency !== "NGN") fail("Invalid provider finance verification response.");
  const recipientCode = typeof data.recipient === "object" ? data.recipient?.recipient_code : data.recipient;
  const transaction = data.transaction;
  return await ctx.runMutation(internal.financeState.applyVerified, {
    operationId: op._id, providerId: String(providerId), amountKobo: data.amount, currency: data.currency, providerStatus: data.status,
    ...(op.kind === "payout" ? { reference: data.reference, recipientCode } : { providerTransactionId: String(typeof transaction === "object" ? transaction?.id : transaction) }),
  });
}
async function dispatch(ctx: ActionCtx, op: Doc<"payouts">): Promise<ReturnType<typeof operationDto>> {
  secret();
  const reserved = await ctx.runMutation(internal.financeState.dispatch, { operationId: op._id });
  if (!reserved) return operationDto(op);
  try {
    const data = reserved.kind === "payout"
      ? await provider("/transfer", { method: "POST", body: JSON.stringify({ source: "balance", amount: reserved.amountKobo, currency: "NGN", recipient: reserved.recipientCode, reference: reserved.reference, reason: `Passenger delivery ${reserved.shipmentId}` }) })
      : await provider("/refund", { method: "POST", body: JSON.stringify({ transaction: reserved.providerTransactionId, amount: reserved.amountKobo, currency: "NGN", merchant_note: reserved.reference, customer_note: "Passenger shipment refund" }) });
    const providerId = reserved.kind === "payout" ? data.transfer_code : data.id;
    if (typeof providerId !== "string" && typeof providerId !== "number") fail("Provider did not return an operation ID.");
    await ctx.runMutation(internal.financeState.attachProvider, { operationId: reserved._id, providerId: String(providerId) });
    return await verifiedOperation(ctx, { ...reserved, providerId: String(providerId) });
  } catch {
    await ctx.runMutation(internal.financeState.uncertain, { operationId: op._id });
    // Do not throw away the operation ID: callers can show its real pending/uncertain state and reconcile safely.
    const current = await ctx.runQuery(internal.financeState.lookup, { kind: op.kind, reference: op.reference });
    return operationDto(current ?? op);
  }
}
export const requestPayout = action({ args: { shipmentId: v.id("shipments") }, handler: async (ctx, args): Promise<ReturnType<typeof operationDto>> => {
  secret(); const op = await ctx.runMutation(internal.financeState.prepare, { subject: await subject(ctx), shipmentId: args.shipmentId, kind: "payout" });
  return dispatch(ctx, op);
} });
export const requestRefund = action({ args: { shipmentId: v.id("shipments"), paymentId: v.optional(v.id("payments")) }, handler: async (ctx, args): Promise<ReturnType<typeof operationDto>> => {
  secret(); const op = await ctx.runMutation(internal.financeState.prepare, { subject: await subject(ctx), ...args, kind: "refund" });
  return dispatch(ctx, op);
} });
export const reconcile = action({ args: { operationId: v.id("payouts") }, handler: async (ctx, args): Promise<ReturnType<typeof operationDto>> => {
  const op = await ctx.runQuery(internal.financeState.authorizeOperation, { subject: await subject(ctx), operationId: args.operationId });
  if (op.status === "prepared") return operationDto(op);
  return verifiedOperation(ctx, op);
} });
export const retry = action({ args: { operationId: v.id("payouts") }, handler: async (ctx, args): Promise<ReturnType<typeof operationDto>> => {
  const sub = await subject(ctx); const op = await ctx.runQuery(internal.financeState.authorizeOperation, { subject: sub, operationId: args.operationId });
  await verifiedOperation(ctx, op);
  const next = await ctx.runMutation(internal.financeState.prepareRetry, { subject: sub, operationId: op._id });
  return dispatch(ctx, next);
} });
export const receiveVerifiedEvent = internalAction({ args: { kind: operationKind, reference: v.optional(v.string()), providerId: v.optional(v.string()), providerTransactionId: v.optional(v.string()) }, handler: async (ctx, args): Promise<void> => {
  const op = await ctx.runQuery(internal.financeState.lookup, args);
  if (op) await verifiedOperation(ctx, op, args.kind === "refund" ? args.providerId : undefined);
} });

// Earnings belong to the signed-in traveller, including payouts already released.
export const earnings = query({ args: {}, handler: async (ctx) => {
  const user = await requireUser(ctx);
  const shipments = await ctx.db.query("shipments").withIndex("by_traveller", q => q.eq("travellerId", user._id)).collect();
  const bank = await ctx.db.query("bankAccounts").withIndex("by_user", q => q.eq("userId", user._id)).first();
  const items = [];
  for (const s of shipments) {
    if ((!s.deliveredAt && s.paymentStatus !== "released") || !["held", "released", "payout_pending", "payout_failed"].includes(s.paymentStatus)) continue;
    const payments = await ctx.db.query("payments").withIndex("by_shipment", q => q.eq("shipmentId", s._id)).collect();
    const payment = payments.filter(p => p.status === "paid" && !p.quarantined).sort((a, b) => b.createdAt - a.createdAt)[0];
    const operations = await ctx.db.query("payouts").withIndex("by_shipment", q => q.eq("shipmentId", s._id)).collect();
    const payout = operations.filter(p => p.kind === "payout").sort((a, b) => b.createdAt - a.createdAt)[0];
    const disputes = await ctx.db.query("disputes").withIndex("by_shipment", q => q.eq("shipmentId", s._id)).collect();
    const amountKobo = payout?.amountKobo ?? payment?.travellerNetKobo ?? (payment ? payment.amountKobo - Math.round(payment.amountKobo / 10) : feeQuote(s.feeNaira).travellerNetKobo);
    const status = s.paymentStatus === "released" ? "paid" : s.paymentStatus === "payout_failed" ? "failed" : s.paymentStatus === "payout_pending" ? "processing" : disputes.some(d => d.status === "open") || s.refundApproved ? "held" : !bank?.recipientCode ? "bank_required" : user.verification !== "verified" || user.suspended ? "verification_required" : !payment?.providerTransactionId ? "held" : "scheduled";
    items.push({ id: s._id, tripId: s.tripId, reference: s.reference, origin: s.origin, destination: s.destination, amountKobo, status, deliveredAt: s.deliveredAt ?? s.updatedAt, payoutAt: s.deliveredAt ? Math.max(s.deliveredAt + 86400000, s.disputeUntil ?? 0) : null });
  }
  return items.sort((a, b) => b.deliveredAt - a.deliveredAt);
} });

export const automaticPayout = internalAction({ args: { shipmentId: v.id("shipments") }, handler: async (ctx, args): Promise<void> => {
  if (!process.env.PAYSTACK_SECRET_KEY) return;
  const owner = await ctx.runQuery(internal.financeState.automaticOwner, args);
  if (!owner) return;
  try {
    const op = await ctx.runMutation(internal.financeState.prepare, { subject: owner, shipmentId: args.shipmentId, kind: "payout" });
    if (op.status === "prepared") await dispatch(ctx, op);
    else if (op.status === "pending" || op.status === "uncertain") await verifiedOperation(ctx, op);
  } catch (error) {
    // The next sweep rechecks eligibility. Failed transfers require reconciliation, never a blind retry.
    console.warn("Automatic payout deferred", args.shipmentId, error instanceof Error ? error.message : "Unavailable");
  }
} });
