import { v } from "convex/values";
import { action, internalAction, query } from "./_generated/server";
import type { ActionCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { fail, requireTransactionalVerification, requireUser, requireVerified, subject } from "./lib";
import { feeQuote } from "./financeSchema";
import { financeAccess, operationDto, operationKind } from "./financeState";

function secret() { const key = process.env.PAYSTACK_SECRET_KEY; if (!key) fail("Live Paystack banking and finance are not configured. No simulated transfer is available."); return key; }
async function paystackProvider(path: string, init?: RequestInit): Promise<any> {
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

type V4Config = { baseUrl: string; apiKey: string; apiSecret: string };
function v4Config(): V4Config | null {
  const apiKey = process.env.V4_VERIFICATION_API_KEY?.trim();
  const apiSecret = process.env.V4_VERIFICATION_API_SECRET?.trim();
  if (!apiKey || !apiSecret) return null;
  const configured = process.env.V4_API_URL?.trim();
  const verificationUrl = process.env.V4_VERIFICATION_API_URL?.trim();
  const baseUrl = (configured || verificationUrl?.replace(/\/verifications\/?$/, "") || "http://127.0.0.1:5000/api/v4").replace(/\/$/, "");
  return { baseUrl, apiKey, apiSecret };
}
function v4BankingConfigured() { return !!v4Config() && (process.env.V4_BANK_ACCOUNT_ENCRYPTION_KEY?.trim().length ?? 0) >= 32; }
async function v4Provider(path: string, init?: RequestInit): Promise<any> {
  const config = v4Config();
  if (!config) fail("V4 banking is not configured.");
  let response: Response;
  try {
    response = await fetch(`${config.baseUrl}${path}`, {
      ...init,
      headers: { "X-API-Key": config.apiKey, "X-API-Secret": config.apiSecret, "Content-Type": "application/json", ...init?.headers },
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    fail("We could not connect to the V4 banking provider. Please try again.");
  }
  let body: any;
  try { body = await response.json(); }
  catch { fail("The V4 banking provider returned an invalid response."); }
  if (!response.ok || body?.success !== true || body.data == null) {
    fail(typeof body?.message === "string" && body.message.trim() ? body.message : "The V4 banking provider could not confirm this request.");
  }
  return body.data;
}
function encryptionSecret() {
  const value = process.env.V4_BANK_ACCOUNT_ENCRYPTION_KEY?.trim();
  if (!value || value.length < 32) fail("V4 bank account encryption is not configured.");
  return value;
}
function bytesToHex(bytes: Uint8Array) { return Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join(""); }
function hexToBytes(value: string) {
  if (!/^(?:[0-9a-f]{2})+$/i.test(value)) fail("Encrypted bank account data is invalid.");
  return new Uint8Array(value.match(/.{2}/g)!.map(byte => Number.parseInt(byte, 16)));
}
async function accountEncryptionKey() {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(encryptionSecret()));
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["encrypt", "decrypt"]);
}
function bankAccountContext(bankCode: string, nameEnquiryReference: string) { return new TextEncoder().encode(`${bankCode}:${nameEnquiryReference}`); }
async function encryptAccountNumber(accountNumber: string, bankCode: string, nameEnquiryReference: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: bankAccountContext(bankCode, nameEnquiryReference) }, await accountEncryptionKey(), new TextEncoder().encode(accountNumber));
  return { encryptedAccountNumber: bytesToHex(new Uint8Array(encrypted)), accountNumberIv: bytesToHex(iv) };
}
async function decryptAccountNumber(encryptedAccountNumber: string, accountNumberIv: string, bankCode: string, nameEnquiryReference: string) {
  try {
    const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv: hexToBytes(accountNumberIv), additionalData: bankAccountContext(bankCode, nameEnquiryReference) }, await accountEncryptionKey(), hexToBytes(encryptedAccountNumber));
    const accountNumber = new TextDecoder().decode(decrypted);
    if (!/^\d{10}$/.test(accountNumber)) fail("Stored payout account is invalid.");
    return accountNumber;
  } catch {
    fail("Stored payout account could not be decrypted. Contact support before retrying.");
  }
}
export const quote = query({ args: { feeNaira: v.number() }, handler: async (ctx, args) => { await requireUser(ctx); return feeQuote(args.feeNaira); } });
export const bankAccount = query({ args: {}, handler: async (ctx) => {
  const u = await requireUser(ctx); const bank = await ctx.db.query("bankAccounts").withIndex("by_user", q => q.eq("userId", u._id)).first();
  return bank ? { accountName: bank.accountName, bankCode: bank.bankCode, last4: bank.last4, ready: bank.bankingProvider === "v4" && !!bank.nameEnquiryReference && !!bank.encryptedAccountNumber && !!bank.accountNumberIv, verifiedAt: bank.verifiedAt } : null;
} });
export const history = query({ args: { shipmentId: v.id("shipments") }, handler: async (ctx, args) => {
  await financeAccess(ctx, await subject(ctx), args.shipmentId);
  return (await ctx.db.query("payouts").withIndex("by_shipment", q => q.eq("shipmentId", args.shipmentId)).collect()).sort((a, b) => b.createdAt - a.createdAt).map(operationDto);
} });
export const banks = action({ args: {}, handler: async (ctx): Promise<Array<{ code: string; name: string }>> => {
  await ctx.runQuery(internal.financeState.bankOwner, { subject: await subject(ctx) });
  await ctx.runMutation(internal.wallet.rateLimit, { subject: await subject(ctx), kind: "bank" });
  if (!v4BankingConfigured()) fail("V4 banking is not fully configured.");
  const data = await v4Provider("/banks");
  if (!Array.isArray(data?.banks)) fail("Invalid V4 bank directory.");
  return data.banks.filter((b: any) => typeof b.bankCode === "string" && typeof b.name === "string").map((b: any) => ({ code: b.bankCode, name: b.name }));
} });
export const setupBank = action({ args: { bankCode: v.string(), accountNumber: v.string() }, handler: async (ctx, args): Promise<{ accountName: string; bankCode: string; last4: string; ready: boolean }> => {
  const sub = await subject(ctx); await ctx.runQuery(internal.financeState.bankOwner, { subject: sub });
  await ctx.runMutation(internal.wallet.rateLimit, { subject: sub, kind: "bank" });
  if (!/^\d{3,10}$/.test(args.bankCode) || !/^\d{10}$/.test(args.accountNumber)) fail("Choose a bank and provide a valid 10-digit Nigerian account number.");
  if (!v4BankingConfigured()) fail("V4 banking is not fully configured.");
  const resolved = await v4Provider("/accounts/verify", { method: "POST", body: JSON.stringify({ accountNumber: args.accountNumber, bankCode: args.bankCode }) });
  if (resolved?.verified !== true || resolved.accountNumber !== args.accountNumber || resolved.bankCode !== args.bankCode || typeof resolved.accountName !== "string" || !resolved.accountName.trim() || typeof resolved.nameEnquiryReference !== "string" || !resolved.nameEnquiryReference.trim()) {
    fail("The V4 provider could not independently verify these bank details.");
  }
  const encrypted = await encryptAccountNumber(args.accountNumber, args.bankCode, resolved.nameEnquiryReference);
  const result = { accountName: resolved.accountName.trim(), bankCode: args.bankCode, last4: args.accountNumber.slice(-4), ready: true };
  await ctx.runMutation(internal.financeState.saveBank, { subject: sub, bankCode: result.bankCode, accountName: result.accountName, last4: result.last4,
    recipientCode: resolved.nameEnquiryReference, nameEnquiryReference: resolved.nameEnquiryReference, ...encrypted });
  return result;
} });

async function submitV4Transfer(ctx: ActionCtx, op: Doc<"payouts">): Promise<ReturnType<typeof operationDto>> {
  if (op.kind !== "payout" || op.bankingProvider !== "v4" || !op.nameEnquiryReference || !op.bankCode || !op.encryptedAccountNumber || !op.accountNumberIv) {
    fail("V4 payout details are incomplete. Contact support before retrying.");
  }
  if (!Number.isSafeInteger(op.amountKobo) || op.amountKobo <= 0 || op.amountKobo % 100 !== 0) fail("V4 payouts require a positive whole-naira amount.");
  const accountNumber = await decryptAccountNumber(op.encryptedAccountNumber, op.accountNumberIv, op.bankCode, op.nameEnquiryReference);
  const data = await v4Provider("/transfers", {
    method: "POST",
    headers: { "Idempotency-Key": op.reference },
    body: JSON.stringify({
      nameEnquiryReference: op.nameEnquiryReference,
      amount: op.amountKobo / 100,
      bankCode: op.bankCode,
      accountNumber,
      narration: `Passenger delivery ${op.shipmentId}`,
    }),
  });
  const providerId = data?.transferId ?? data?.transferReference ?? data?.paymentReference ?? data?.sessionId ?? data?.reference ?? data?.id ?? op.reference;
  if (typeof providerId !== "string" && typeof providerId !== "number") fail("V4 banking did not return a valid transfer result.");
  await ctx.runMutation(internal.financeState.attachProvider, { operationId: op._id, providerId: String(providerId) });
  return ctx.runMutation(internal.financeState.applyVerified, {
    operationId: op._id,
    providerId: String(providerId),
    amountKobo: op.amountKobo,
    currency: "NGN",
    providerStatus: "success",
    reference: op.reference,
    recipientCode: op.recipientCode,
  });
}

async function verifiedOperation(ctx: ActionCtx, op: Doc<"payouts">, refundId?: string): Promise<ReturnType<typeof operationDto>> {
  if (op.kind === "payout") {
    if (op.bankingProvider !== "v4") fail("This payout account must be reverified through V4 banking.");
    return submitV4Transfer(ctx, op);
  }
  let data: any;
  {
    let id = op.providerId ?? refundId;
    if (!id) {
      // Refund create has no client idempotency key. Recover only an exact unique merchant-note match.
      // Bounded listing is safe: absence never authorizes resending an uncertain refund.
      const matches: any[] = [];
      for (let page = 1; page <= 10; page++) {
        const list = await paystackProvider(`/refund?perPage=100&page=${page}`);
        if (!Array.isArray(list)) fail("Invalid provider refund reconciliation response.");
        for (const item of list) if (item.merchant_note === op.reference) matches.push(item);
        if (list.length < 100) break;
      }
      if (matches.length !== 1 || matches[0].id === undefined) fail("Refund has no uniquely verifiable provider ID yet. Keep this operation pending; ask support to reconcile externally if needed.");
      id = String(matches[0].id);
    }
    data = await paystackProvider(`/refund/${encodeURIComponent(id)}`);
    if (String(data.id) !== id || !op.providerId && data.merchant_note !== op.reference) fail("Provider refund does not match this operation.");
  }
  const providerId = data.id;
  if (typeof providerId !== "string" && typeof providerId !== "number" || !Number.isSafeInteger(data.amount) || typeof data.status !== "string" || data.currency !== "NGN") fail("Invalid provider finance verification response.");
  const transaction = data.transaction;
  return await ctx.runMutation(internal.financeState.applyVerified, {
    operationId: op._id, providerId: String(providerId), amountKobo: data.amount, currency: data.currency, providerStatus: data.status,
    providerTransactionId: String(typeof transaction === "object" ? transaction?.id : transaction),
  });
}
async function dispatch(ctx: ActionCtx, op: Doc<"payouts">): Promise<ReturnType<typeof operationDto>> {
  if (op.status === "success") return operationDto(op);
  const reserved = await ctx.runMutation(internal.financeState.dispatch, { operationId: op._id });
  if (!reserved) return operationDto(op);
  try {
    if (reserved.kind === "payout") {
      if (reserved.bankingProvider !== "v4") fail("This payout account must be reverified through V4 banking.");
      return await submitV4Transfer(ctx, reserved);
    }
    secret();
    const data = await paystackProvider("/refund", { method: "POST", body: JSON.stringify({ transaction: reserved.providerTransactionId, amount: reserved.amountKobo, currency: "NGN", merchant_note: reserved.reference, customer_note: "Passenger shipment refund" }) });
    const providerId = data.id;
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
  if (!v4BankingConfigured()) fail("V4 banking and payouts are not configured. No simulated transfer is available.");
  const op = await ctx.runMutation(internal.financeState.prepare, { subject: await subject(ctx), shipmentId: args.shipmentId, kind: "payout" });
  return dispatch(ctx, op);
} });
export const requestRefund = action({ args: { shipmentId: v.id("shipments"), paymentId: v.optional(v.id("payments")) }, handler: async (ctx, args): Promise<ReturnType<typeof operationDto>> => {
  secret(); const op = await ctx.runMutation(internal.financeState.prepare, { subject: await subject(ctx), ...args, kind: "refund" });
  return dispatch(ctx, op);
} });
export const reconcile = action({ args: { operationId: v.id("payouts") }, handler: async (ctx, args): Promise<ReturnType<typeof operationDto>> => {
  await ctx.runMutation(internal.wallet.rateLimit, { subject: await subject(ctx), kind: "finance-check" });
  const op = await ctx.runQuery(internal.financeState.authorizeOperation, { subject: await subject(ctx), operationId: args.operationId });
  if (op.status === "prepared" || op.status === "success" && !op.providerId) return operationDto(op);
  return verifiedOperation(ctx, op);
} });
export const retry = action({ args: { operationId: v.id("payouts") }, handler: async (ctx, args): Promise<ReturnType<typeof operationDto>> => {
  const sub = await subject(ctx);
  await ctx.runMutation(internal.wallet.rateLimit, { subject: sub, kind: "finance-check" });
  const op = await ctx.runQuery(internal.financeState.authorizeOperation, { subject: sub, operationId: args.operationId });
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
  const bankReady = bank?.bankingProvider === "v4" && !!bank.nameEnquiryReference && !!bank.encryptedAccountNumber && !!bank.accountNumberIv;
  const items = [];
  for (const s of shipments) {
    if ((!s.deliveredAt && s.paymentStatus !== "released") || !["held", "released", "payout_pending", "payout_failed"].includes(s.paymentStatus)) continue;
    const payments = await ctx.db.query("payments").withIndex("by_shipment", q => q.eq("shipmentId", s._id)).collect();
    const payment = payments.filter(p => p.status === "paid" && !p.quarantined).sort((a, b) => b.createdAt - a.createdAt)[0];
    const operations = await ctx.db.query("payouts").withIndex("by_shipment", q => q.eq("shipmentId", s._id)).collect();
    const payout = operations.filter(p => p.kind === "payout").sort((a, b) => b.createdAt - a.createdAt)[0];
    const disputes = await ctx.db.query("disputes").withIndex("by_shipment", q => q.eq("shipmentId", s._id)).collect();
    const amountKobo = payout?.amountKobo ?? payment?.travellerNetKobo ?? (payment ? payment.amountKobo - Math.round(payment.amountKobo / 10) : feeQuote(s.feeNaira).travellerNetKobo);
    const fundingOwner = payment?.source === "wallet" ? await ctx.db.get(s.senderId) : null;
    const fundingBlocked = payment?.source === "wallet" && (!fundingOwner || fundingOwner.walletBlocked || fundingOwner.suspended);
    const status = s.paymentStatus === "released" ? "paid" : s.paymentStatus === "payout_failed" ? "failed" : s.paymentStatus === "payout_pending" ? "processing" : disputes.some(d => d.status === "open") || s.refundApproved || fundingBlocked ? "held" : !bankReady ? "bank_required" : user.verification !== "verified" || user.suspended ? "verification_required" : (!payment || payment.source !== "wallet" && !payment.providerTransactionId) ? "held" : "scheduled";
    items.push({ id: s._id, tripId: s.tripId, reference: s.reference, origin: s.origin, destination: s.destination, amountKobo, status, deliveredAt: s.deliveredAt ?? s.updatedAt, payoutAt: s.deliveredAt ? Math.max(s.deliveredAt + 86400000, s.disputeUntil ?? 0) : null });
  }
  return items.sort((a, b) => b.deliveredAt - a.deliveredAt);
} });

export const automaticPayout = internalAction({ args: { shipmentId: v.id("shipments") }, handler: async (ctx, args): Promise<void> => {
  if (!v4BankingConfigured()) return;
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

export const reconcileInternal = internalAction({ args: { operationId: v.id("payouts") }, handler: async (ctx, args): Promise<void> => {
  const op = await ctx.runQuery(internal.financeState.operationById, args);
  if (!op || !["pending", "uncertain"].includes(op.status)) return;
  if (op.kind === "payout" ? !v4BankingConfigured() : !process.env.PAYSTACK_SECRET_KEY) return;
  try { await verifiedOperation(ctx, op); } catch { await ctx.runMutation(internal.wallet.raiseAlert, { key: op.reference, detail: `Unable to reconcile ${op.kind} ${op.reference}. Do not send another operation.` }); }
} });
