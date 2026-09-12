"use node";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { v } from "convex/values";
import { action, internalAction } from "./_generated/server";
import type { ActionCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { fail, subject } from "./lib";
function secret(): string { const key = process.env.PAYSTACK_SECRET_KEY; if (!key) fail("Live payments are not configured on this deployment."); return key; }
async function provider(path: string, key: string, init?: RequestInit): Promise<any> {
  let response: Response;
  try {
    response = await fetch(`https://api.paystack.co${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...init?.headers },
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    fail("We could not connect to Paystack. Please check your connection and try again.");
  }
  if (!response.ok) fail("Paystack request failed. Reconcile the existing reference before retrying.");
  let body: any;
  try {
    body = await response.json();
  } catch {
    fail("Paystack returned an invalid response. Existing reference preserved.");
  }
  if (body?.status !== true || !body.data) fail("Paystack could not confirm this request. Existing reference preserved.");
  return body.data;
}
async function verify(ctx: ActionCtx, reference: string, key: string): Promise<string> {
  const data = await provider(`/transaction/verify/${encodeURIComponent(reference)}`, key);
  if (data.reference !== reference || !Number.isSafeInteger(data.amount) || data.currency !== "NGN" || typeof data.status !== "string") fail("Unexpected provider verification response.");
  if (data.status === "success") {
    if (typeof data.id !== "number" && typeof data.id !== "string") fail("Missing provider transaction ID.");
    await ctx.runMutation(internal.paymentState.confirmPaid, { reference, amountKobo: data.amount, currency: data.currency, providerTransactionId: String(data.id) });
  } else await ctx.runMutation(internal.paymentState.recordVerification, { reference, amountKobo: data.amount, currency: data.currency, providerStatus: data.status });
  return data.status;
}
async function checkout(ctx: ActionCtx, shipmentId: Id<"shipments">, retry = false): Promise<{ url: string }> {
  const identity = await ctx.auth.getUserIdentity(); if (!identity) fail("Sign in required.");
  const key = secret();
  await ctx.runMutation(internal.wallet.rateLimit, { subject: identity.subject.split("|")[0]!, kind: "checkout" });
  const email = identity.email;
  if (typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail("A verified account email is required for payment.");
  const callback = process.env.PAYSTACK_CALLBACK_URL;
  if (callback && new URL(callback).protocol !== "https:") fail("Paystack callback must use HTTPS.");
  if (retry) {
    const attempts = await ctx.runQuery(internal.paymentState.forReconcile, { subject: identity.subject.split("|")[0]!, shipmentId });
    // Verify every prior attempt. A superseded late payment must be quarantined, never ignored.
    for (const attempt of attempts) { const status = await verify(ctx, attempt.reference, key); if (status === "success") fail("Payment was received. Refresh finance status; do not pay again."); }
  }
  const payment = await ctx.runMutation(internal.paymentState.prepare, { subject: identity.subject.split("|")[0]!, shipmentId, reference: `passenger-${randomBytes(24).toString("hex")}`, retry });
  if (payment.url && !payment.initialize) return { url: payment.url };
  if (!payment.initialize) fail("Checkout initialization is pending or uncertain. Reconcile the existing reference; another charge was not created.");
  try {
    const data = await provider("/transaction/initialize", key, { method: "POST", body: JSON.stringify({ email, amount: payment.amountKobo, currency: "NGN", reference: payment.reference, ...(callback ? { callback_url: callback } : {}), metadata: { shipmentId } }) });
    if (data.reference !== payment.reference || typeof data.authorization_url !== "string") fail("Unexpected provider checkout response.");
    const url = new URL(data.authorization_url);
    if (url.protocol !== "https:" || url.hostname !== "checkout.paystack.com" || url.username || url.password) fail("Invalid provider checkout URL.");
    await ctx.runMutation(internal.paymentState.attachUrl, { paymentId: payment.paymentId, url: url.toString() });
    return { url: url.toString() };
  } catch {
    await ctx.runMutation(internal.paymentState.initializeFailed, { paymentId: payment.paymentId });
    fail("Checkout could not be confirmed. The reference is preserved; reconcile before retrying. No simulated payment was recorded.");
  }
}
export const initialize = action({ args: { shipmentId: v.id("shipments") }, handler: async (ctx, args): Promise<{ url: string }> => checkout(ctx, args.shipmentId) });
export const retry = action({ args: { shipmentId: v.id("shipments") }, handler: async (ctx, args): Promise<{ url: string }> => checkout(ctx, args.shipmentId, true) });
export const reconcile = action({ args: { shipmentId: v.id("shipments") }, handler: async (ctx, args): Promise<{ status: string; reference: string }> => {
  const attempts = await ctx.runQuery(internal.paymentState.forReconcile, { subject: await subject(ctx), shipmentId: args.shipmentId });
  if (!attempts.length) fail("No provider payment exists for this shipment.");
  await ctx.runMutation(internal.wallet.rateLimit, { subject: await subject(ctx), kind: "reconcile" });
  const key = secret(); let result = { status: "pending", reference: attempts[0].reference };
  for (const attempt of attempts) { const status = await verify(ctx, attempt.reference, key); if (attempt.reference === result.reference) result = { status, reference: attempt.reference }; }
  return result;
} });
export const receiveWebhook = internalAction({ args: { body: v.string(), signature: v.string() }, handler: async (ctx, args): Promise<{ status: number }> => {
  const key = process.env.PAYSTACK_SECRET_KEY; if (!key) return { status: 503 };
  if (!/^[a-f0-9]{128}$/i.test(args.signature)) return { status: 401 };
  const computed = createHmac("sha512", key).update(args.body, "utf8").digest();
  if (!timingSafeEqual(computed, Buffer.from(args.signature, "hex"))) return { status: 401 };
  let event: any; try { event = JSON.parse(args.body); } catch { return { status: 400 }; }
  try {
    if (event?.event === "charge.success") {
      const data = event.data;
      if (typeof data?.reference !== "string" || data.reference.length > 200 || data.status !== "success" || !Number.isSafeInteger(data.amount) || data.currency !== "NGN" || (typeof data.id !== "number" && typeof data.id !== "string")) return { status: 400 };
      if (data.reference.startsWith("wallet-")) {
        const deposit = await ctx.runQuery(internal.wallet.depositByReference, { reference: data.reference });
        if (deposit) {
          await ctx.runMutation(internal.wallet.recordTopUp, {
            userId: deposit.userId,
            amountNaira: data.amount / 100,
            reference: data.reference,
            providerTransactionId: String(data.id),
          });
        }
      } else {
        await ctx.runMutation(internal.paymentState.confirmPaid, { reference: data.reference, amountKobo: data.amount, currency: data.currency, providerTransactionId: String(data.id) });
      }
    } else if (["charge.dispute.create", "charge.dispute.remind", "charge.dispute.resolve"].includes(event?.event)) {
      const reference = event.data?.transaction?.reference;
      if (typeof reference !== "string" || !event.data?.id) return { status: 400 };
      await ctx.runMutation(internal.wallet.flagRisk, { reference, eventId: String(event.data.id), reversed: false });
    } else if (["transfer.success", "transfer.failed", "transfer.reversed", "refund.processed", "refund.failed", "refund.pending", "refund.processing"].includes(event?.event)) {
      const kind = event.event.startsWith("transfer.") ? "payout" : "refund";
      const reference = typeof event.data?.reference === "string" ? event.data.reference : undefined;
      const providerId = event.data?.id !== undefined ? String(event.data.id) : undefined;
      const transaction = event.data?.transaction;
      const providerTransactionId = transaction !== undefined ? String(typeof transaction === "object" ? transaction?.id : transaction) : undefined;
      if (kind === "payout" && !reference || kind === "refund" && !providerId) return { status: 400 };
      if (kind === "refund") await reviewRefund(ctx, providerId!, key);
      await ctx.runAction(internal.finance.receiveVerifiedEvent, { kind, reference, providerId, providerTransactionId });
    }
    return { status: 200 };
  } catch { return { status: 503 }; }
} });

async function reviewRefund(ctx: ActionCtx, id: string, key: string) {
  const refund = await provider(`/refund/${encodeURIComponent(id)}`, key);
  if (String(refund.id) !== id) fail("Refund ID mismatch.");
  const transactionId = String(typeof refund.transaction === "object" ? refund.transaction?.id : refund.transaction);
  const p = await ctx.runQuery(internal.wallet.depositByProviderId, { providerTransactionId: transactionId });
  if (!p) return;
  await ctx.runMutation(internal.wallet.flagRisk, { reference: p.reference, eventId: `refund-${id}`, reversed: false });
  if (refund.status === "processed") await ctx.runMutation(internal.wallet.recordProviderRefund, { reference: p.reference, providerId: id, providerTransactionId: transactionId, amountKobo: refund.amount, currency: refund.currency });
}
export const sweepRefunds = internalAction({ args: { page: v.optional(v.number()) }, handler: async (ctx, args): Promise<void> => {
  const key = process.env.PAYSTACK_SECRET_KEY; if (!key) return;
  const page = args.page ?? 1;
  try {
    const refunds = await provider(`/refund?perPage=100&page=${page}`, key);
    if (!Array.isArray(refunds)) fail("Invalid refund listing.");
    for (const refund of refunds) {
      const transactionId = String(typeof refund.transaction === "object" ? refund.transaction?.id : refund.transaction);
      const p = await ctx.runQuery(internal.wallet.depositByProviderId, { providerTransactionId: transactionId });
      if (p) await reviewRefund(ctx, String(refund.id), key);
    }
    if (refunds.length === 100) await ctx.scheduler.runAfter(0, internal.payments.sweepRefunds, { page: page + 1 });
  } catch {
    await ctx.runMutation(internal.wallet.raiseAlert, { key: "refund-reconciliation", detail: `Unable to finish Paystack refund reconciliation at page ${page}. Check provider access and retry.` });
  }
} });
