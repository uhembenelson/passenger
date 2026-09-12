import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { action, internalAction, internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { feeQuote } from "./financeSchema";
import { internal } from "./_generated/api";
import type { MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { audit, fail, requireActive, requireAdmin, isAdmin, notify, requireUser, subject, userBySubject } from "./lib";

export function paymentMode(): "live" | "test" { return process.env.PAYSTACK_SECRET_KEY?.startsWith("sk_live_") ? "live" : "test"; }

type TopUpInitialization = { mode: "provider"; url: string; reference: string };

export const balance = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    return { balanceNaira: Math.max(0, user.walletVerifiedBalanceNaira ?? 0), blocked: !!user.walletBlocked };
  },
});

export const transactionsPage = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const result = await ctx.db
      .query("walletTransactions")
      .withIndex("by_user", q => q.eq("userId", user._id))
      .order("desc")
      .paginate(args.paginationOpts);
    return {
      ...result,
      page: result.page.map(t => ({
        id: t._id,
        userId: t.userId,
        kind: t.kind,
        amountNaira: t.amountNaira,
        reference: t.reference,
        shipmentId: t.shipmentId,
        createdAt: t.createdAt,
        note: t.note,
      })),
    };
  },
});

export async function paymentRateLimit(ctx: MutationCtx, key: string, limit = 10) {
  const row = await ctx.db.query("paymentRateLimits").withIndex("by_key", q => q.eq("key", key)).unique();
  const now = Date.now();
  if (row && now - row.windowStart < 60_000 && row.count >= limit) fail("Too many payment requests. Please wait a minute.");
  const data = { key, windowStart: row && now - row.windowStart < 60_000 ? row.windowStart : now, count: row && now - row.windowStart < 60_000 ? row.count + 1 : 1 };
  if (row) await ctx.db.patch(row._id, data); else await ctx.db.insert("paymentRateLimits", data);
}
export const rateLimit = internalMutation({ args: { subject: v.string(), kind: v.string() }, handler: async (ctx, args) => {
  const user = await userBySubject(ctx, args.subject);
  await paymentRateLimit(ctx, `${user._id}:${args.kind}`);
} });
export async function paymentAlert(ctx: MutationCtx, key: string, detail: string) {
  const existing = await ctx.db.query("paymentAlerts").withIndex("by_key", q => q.eq("key", key)).unique();
  if (existing) await ctx.db.patch(existing._id, { detail, updatedAt: Date.now(), resolvedAt: undefined });
  else {
    await ctx.db.insert("paymentAlerts", { key, detail, createdAt: Date.now(), updatedAt: Date.now() });
    await audit(ctx, null, "payment.attention_required", detail);
    for (const sub of (process.env.ADMIN_CLERK_SUBJECTS ?? "").split(",").map((s: string) => s.trim()).filter(Boolean)) {
      const admin = await ctx.db.query("users").withIndex("by_subject", q => q.eq("subject", sub)).unique();
      if (admin && isAdmin(admin)) await notify(ctx, admin._id, "Payment needs review", detail);
    }
  }
}
export const alerts = query({ args: {}, handler: async (ctx) => { await requireAdmin(ctx); return ctx.db.query("paymentAlerts").order("desc").take(100); } });
export const reserveTopUp = internalMutation({
  args: { userId: v.id("users"), reference: v.string(), amountKobo: v.number() },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId); if (!user) fail("User not found."); requireActive(user);
    if (user.walletMode && user.walletMode !== paymentMode()) fail("This wallet belongs to a different Paystack environment. Use a separate live account.");
    if (user.walletBlocked) fail("Your wallet is under payment review. Contact support.");
    if (!Number.isSafeInteger(args.amountKobo) || args.amountKobo <= 0 || args.amountKobo % 100 !== 0) fail("Invalid deposit amount.");
    const existing = await ctx.db.query("walletDeposits").withIndex("by_user_and_status", q => q.eq("userId", user._id).eq("status", "pending")).first();
    if (existing) return { deposit: existing, initialize: false };
    const id = await ctx.db.insert("walletDeposits", { ...args, providerMode: paymentMode(), status: "pending", createdAt: Date.now(), nextCheckAt: Date.now() + 300_000 });
    return { deposit: (await ctx.db.get(id))!, initialize: true };
  },
});
export const attachCheckout = internalMutation({ args: { reference: v.string(), url: v.string() }, handler: async (ctx, args) => {
  const p = await ctx.db.query("walletDeposits").withIndex("by_reference", q => q.eq("reference", args.reference)).unique();
  if (!p) fail("Deposit not found.");
  await ctx.db.patch(p._id, { url: args.url });
} });
export const pendingDeposit = query({ args: {}, handler: async (ctx) => {
  const user = await requireUser(ctx);
  const p = await ctx.db.query("walletDeposits").withIndex("by_user_and_status", q => q.eq("userId", user._id).eq("status", "pending")).first();
  return p ? { reference: p.reference, amount: p.amountKobo / 100, url: p.url ?? "" } : null;
} });

export const depositByReference = internalQuery({
  args: { reference: v.string() },
  handler: async (ctx, args) => ctx.db.query("walletDeposits").withIndex("by_reference", q => q.eq("reference", args.reference)).unique(),
});

export const recordTopUp = internalMutation({
  args: {
    userId: v.id("users"),
    amountNaira: v.number(),
    reference: v.string(),
    providerTransactionId: v.string(),
  },
  handler: async (ctx, args) => {
    const deposit = await ctx.db.query("walletDeposits").withIndex("by_reference", q => q.eq("reference", args.reference)).unique();
    if (!deposit || deposit.userId !== args.userId || !Number.isSafeInteger(args.amountNaira) || args.amountNaira <= 0 || deposit.amountKobo !== args.amountNaira * 100) fail("Deposit does not match the saved payment.");
    const existing = await ctx.db
      .query("walletTransactions")
      .withIndex("by_reference", q => q.eq("reference", args.reference))
      .unique();
    if (deposit.providerTransactionId && deposit.providerTransactionId !== args.providerTransactionId) fail("Provider transaction ID mismatch.");
    if (existing || deposit.creditedAt) return;
    if (deposit.reversedAt || deposit.disputedAt) fail("Deposit is under payment review.");

    const user = await ctx.db.get(args.userId);
    if (!user) fail("User not found.");

    if (deposit.providerMode !== paymentMode() || user.walletMode && user.walletMode !== deposit.providerMode) fail("Payment environment mismatch. Contact support.");
    const sameTransaction = await ctx.db.query("walletDeposits").withIndex("by_providerTransactionId", q => q.eq("providerTransactionId", args.providerTransactionId)).unique();
    if (sameTransaction && sameTransaction._id !== deposit._id) fail("Provider transaction already belongs to another deposit.");
    const currentBalance = user.walletBalanceNaira ?? 0;
    const nextBalance = currentBalance + args.amountNaira;
    if (!Number.isSafeInteger(nextBalance) || !Number.isSafeInteger((user.walletVerifiedBalanceNaira ?? 0) + args.amountNaira)) fail("Wallet balance limit exceeded.");

    await ctx.db.patch(deposit._id, { status: "paid", creditedAt: Date.now(), providerTransactionId: args.providerTransactionId, nextCheckAt: Date.now() + 86400000 });
    await ctx.db.patch(user._id, { walletBalanceNaira: nextBalance, walletMode: deposit.providerMode, walletVerifiedBalanceNaira: (user.walletVerifiedBalanceNaira ?? 0) + args.amountNaira });
    await ctx.db.insert("walletTransactions", {
      userId: user._id,
      kind: "top_up",
      amountNaira: args.amountNaira,
      reference: args.reference,
      createdAt: Date.now(),
      note: `Wallet funded with ₦${args.amountNaira.toLocaleString()}`,
    });
    await audit(ctx, user, "wallet.top_up", `Added ₦${args.amountNaira.toLocaleString()} to wallet. New balance: ₦${nextBalance.toLocaleString()}`);
  },
});

export const requestWithdrawal = mutation({
  args: {
    amountNaira: v.number(),
    bankCode: v.optional(v.string()),
    accountNumber: v.optional(v.string()),
    accountName: v.optional(v.string()),
  },
  handler: async (ctx, _args) => {
    await requireUser(ctx);
    fail("General wallet withdrawal is not available. Traveller payouts use the verified delivery payout flow after completion and dispute checks.");
  },
});

async function walletPayment(ctx: MutationCtx, shipmentId: Id<"shipments">) {
  return ctx.db.query("payments").withIndex("by_shipment", q => q.eq("shipmentId", shipmentId)).filter(q => q.eq(q.field("source"), "wallet")).unique();
}
async function assertHoldMutable(ctx: MutationCtx, p: Doc<"payments">) {
  const operations = await ctx.db.query("payouts").withIndex("by_payment", q => q.eq("paymentId", p._id)).collect();
  if (operations.some(o => !["failed", "reversed"].includes(o.status))) fail("Payment operation exists. Reconcile it before changing held funds.");
}
export async function deductForShipment(ctx: MutationCtx, user: Doc<"users">, shipmentId: Id<"shipments">, amountNaira: number) {
  // Re-read within the transaction; callers may already have changed the balance.
  user = (await ctx.db.get(user._id))!;
  if (user.walletMode && user.walletMode !== paymentMode()) fail("Wallet payment environment mismatch.");
  if (user.walletBlocked) fail("Your wallet is under payment review. Contact support.");
  if (!Number.isSafeInteger(amountNaira) || amountNaira <= 0) fail("Invalid wallet debit.");
  const current = user.walletVerifiedBalanceNaira ?? 0;
  if (current < amountNaira) fail("Insufficient verified wallet balance. Add money with Paystack or contact support about an older balance.");
  const p = await walletPayment(ctx, shipmentId);
  if (p) await assertHoldMutable(ctx, p);
  const amountKobo = (p ? p.amountKobo - (p.refundedKobo ?? 0) : 0) + amountNaira * 100;
  const quote = feeQuote(amountKobo / 100);
  if (p) await ctx.db.patch(p._id, { amountKobo, refundedKobo: 0, platformFeeKobo: quote.platformFeeKobo, travellerNetKobo: quote.travellerNetKobo });
  else await ctx.db.insert("payments", { source: "wallet", providerMode: user.walletMode ?? paymentMode(), shipmentId, reference: `wallet-hold-${shipmentId}`, amountKobo, platformFeeKobo: quote.platformFeeKobo, travellerNetKobo: quote.travellerNetKobo, currency: "NGN", status: "paid", createdAt: Date.now(), paidAt: Date.now() });
  await ctx.db.patch(user._id, { walletBalanceNaira: (user.walletBalanceNaira ?? 0) - amountNaira, walletVerifiedBalanceNaira: current - amountNaira });
  await ctx.db.insert("walletTransactions", { userId: user._id, kind: "parcel_hold", amountNaira, reference: `hold-${shipmentId}-${Date.now()}`, shipmentId, createdAt: Date.now(), note: "Delivery fee held for parcel" });
  await audit(ctx, user, "wallet.held", `Held ${amountNaira} naira of verified wallet funds.`, shipmentId);
}
export async function refundForShipment(ctx: MutationCtx, user: Doc<"users">, shipmentId: Id<"shipments">, amountNaira: number, reason: string) {
  const p = await walletPayment(ctx, shipmentId);
  if (!p) fail("Verified wallet hold not found. Contact support to reconcile older funds.");
  await assertHoldMutable(ctx, p);
  if (!Number.isSafeInteger(amountNaira) || amountNaira <= 0 || amountNaira * 100 > p.amountKobo - (p.refundedKobo ?? 0)) fail("Refund exceeds the remaining wallet hold.");
  user = (await ctx.db.get(user._id))!;
  const s = await ctx.db.get(shipmentId); if (!s || s.senderId !== user._id) fail("Wallet hold owner mismatch.");
  const refundedKobo = (p.refundedKobo ?? 0) + amountNaira * 100;
  await ctx.db.patch(p._id, { refundedKobo, platformFeeKobo: (p.amountKobo - refundedKobo) / 10, travellerNetKobo: (p.amountKobo - refundedKobo) - (p.amountKobo - refundedKobo) / 10 });
  await ctx.db.patch(user._id, { walletBalanceNaira: (user.walletBalanceNaira ?? 0) + amountNaira, walletVerifiedBalanceNaira: (user.walletVerifiedBalanceNaira ?? 0) + amountNaira });
  await ctx.db.insert("walletTransactions", { userId: user._id, kind: "parcel_refund", amountNaira, reference: `refund-${p._id}-${refundedKobo}`, shipmentId, createdAt: Date.now(), note: reason });
  await audit(ctx, user, "wallet.refunded", `Returned ${amountNaira} naira to wallet: ${reason}`, shipmentId);
}

export const initializeTopUp = action({
  args: { amountNaira: v.number() },
  handler: async (ctx, args): Promise<TopUpInitialization> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) fail("Sign in required.");

    const amountNaira = args.amountNaira;
    const productConfig = await ctx.runQuery(internal.productConfig.getInternal, {});
    const { minTopUpNaira, maxTopUpNaira } = productConfig.wallet;
    if (!Number.isSafeInteger(amountNaira) || amountNaira < minTopUpNaira || amountNaira > maxTopUpNaira) {
      fail(`Enter a whole-naira amount between ₦${minTopUpNaira.toLocaleString()} and ₦${maxTopUpNaira.toLocaleString()}.`);
    }

    const sub = identity.subject.split("|")[0]!;
    const user = await ctx.runQuery(internal.wallet.getUserForTopUp, { sub });
    if (!user) fail("Complete your profile first.");
    requireActive(user);

    const key = process.env.PAYSTACK_SECRET_KEY;
    if (!key) fail("Payments are not available yet. Please try again later.");

    const email = identity.email ?? user.email;
    if (typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      fail("A verified email is required for wallet top-up.");
    }

    await ctx.runMutation(internal.wallet.rateLimit, { subject: sub, kind: "initialize" });
    const reference = `wallet-${crypto.randomUUID()}`;
    const callback = process.env.PAYSTACK_CALLBACK_URL;
    if (callback) {
      let url: URL;
      try { url = new URL(callback); } catch { fail("Payment return URL is invalid."); }
      if (url.protocol !== "https:" || url.username || url.password) fail("Payment return URL must use HTTPS.");
    }
    const amountKobo = amountNaira * 100;
    const reserved = await ctx.runMutation(internal.wallet.reserveTopUp, { userId: user._id, reference, amountKobo });
    if (!reserved.initialize) {
      if (reserved.deposit.amountKobo !== amountKobo) fail("Finish or check your existing deposit before changing the amount.");
      if (reserved.deposit.url) return { mode: "provider", url: reserved.deposit.url, reference: reserved.deposit.reference };
      fail("Your existing deposit is being checked. Open your wallet to check its status; another checkout was not created.");
    }

    let response: Response;
    try {
      response = await fetch("https://api.paystack.co/transaction/initialize", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email,
          amount: amountKobo,
          currency: "NGN",
          reference,
          ...(callback ? { callback_url: callback } : {}),
          metadata: {
            kind: "wallet_topup",
            amountNaira,
            subject: sub,
          },
        }),
        signal: AbortSignal.timeout(15000),
      });
    } catch {
      fail("We could not connect to the payment provider. Please check your connection and try again.");
    }

    if (!response.ok) fail("Failed to contact payment provider.");
    const body = await response.json().catch(() => null) as { status?: boolean; data?: { authorization_url?: string; reference?: string } } | null;
    if (body?.status !== true || !body.data?.authorization_url || body.data.reference !== reference) {
      fail("Could not initialize payment with provider.");
    }

    const checkoutUrl = new URL(body.data.authorization_url);
    if (checkoutUrl.protocol !== "https:" || checkoutUrl.hostname !== "checkout.paystack.com" || checkoutUrl.username || checkoutUrl.password) fail("Invalid payment checkout URL.");
    await ctx.runMutation(internal.wallet.attachCheckout, { reference, url: checkoutUrl.toString() });
    return {
      mode: "provider",
      url: body.data.authorization_url,
      reference,
    };
  },
});

export const topUpByReference = internalQuery({
  args: { reference: v.string() },
  handler: async (ctx, args) => {
    const transaction = await ctx.db
      .query("walletTransactions")
      .withIndex("by_reference", q => q.eq("reference", args.reference))
      .unique();
    if (!transaction || transaction.kind !== "top_up") return null;
    return {
      userId: transaction.userId,
      amountNaira: transaction.amountNaira,
      reference: transaction.reference,
    };
  },
});

async function verifyDeposit(ctx: import("./_generated/server").ActionCtx, reference: string) {
  const key = process.env.PAYSTACK_SECRET_KEY; if (!key) fail("Payments are not available yet.");
  const deposit = await ctx.runQuery(internal.wallet.depositByReference, { reference });
  if (!deposit) fail("Payment not found.");
  const response = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(15000) });
  const body = await response.json().catch(() => null);
  const data = body?.data;
  if (!response.ok || body?.status !== true || !data || data.reference !== reference || data.amount !== deposit.amountKobo || data.currency !== "NGN") fail("Payment verification did not match your deposit.");
  if (data.domain && data.domain !== paymentMode()) fail("Payment environment mismatch.");
  if (data.status === "success") {
    if (!["string", "number"].includes(typeof data.id)) fail("Missing provider transaction ID.");
    await ctx.runMutation(internal.wallet.recordTopUp, { userId: deposit.userId, reference, amountNaira: data.amount / 100, providerTransactionId: String(data.id) });
  } else if (data.status === "reversed") {
    await ctx.runMutation(internal.wallet.flagRisk, { reference, eventId: `reversal-${reference}`, reversed: true });
  }
  await ctx.runMutation(internal.wallet.recordCheck, { reference, status: data.status });
  return data.status === "success" && !deposit.disputedAt && !deposit.reversedAt;
}
export const verifyTopUp = action({
  args: { reference: v.string() },
  handler: async (ctx, args): Promise<{ success: boolean; balanceNaira: number }> => {
    const sub = await subject(ctx);
    const user = await ctx.runQuery(internal.wallet.getUserForTopUp, { sub });
    const deposit = await ctx.runQuery(internal.wallet.depositByReference, args);
    if (!deposit || deposit.userId !== user._id) fail("Payment not found.");
    await ctx.runMutation(internal.wallet.rateLimit, { subject: sub, kind: "verify" });
    const success = await verifyDeposit(ctx, args.reference);
    const updated = await ctx.runQuery(internal.wallet.getUserForTopUp, { sub });
    return { success, balanceNaira: Math.max(0, updated.walletVerifiedBalanceNaira ?? 0) };
  },
});
export const recordCheck = internalMutation({ args: { reference: v.string(), status: v.string() }, handler: async (ctx, args) => {
  const p = await ctx.db.query("walletDeposits").withIndex("by_reference", q => q.eq("reference", args.reference)).unique();
  if (!p) return;
  const terminal = ["failed", "abandoned"].includes(args.status) && !p.creditedAt;
  await ctx.db.patch(p._id, { ...(terminal ? { status: "failed" as const } : {}), lastCheckedAt: Date.now(), nextCheckAt: terminal || p.reversedAt ? undefined : Date.now() + (p.creditedAt ? 86400000 : 300000) });
  if (p.status === "pending" && !terminal && args.status !== "success" && Date.now() - p.createdAt > 900000) await paymentAlert(ctx, p.reference, `Deposit ${p.reference} remains unresolved. Review Paystack before allowing another checkout.`);
  if (terminal || args.status === "success") {
    const alert = await ctx.db.query("paymentAlerts").withIndex("by_key", q => q.eq("key", p.reference)).unique();
    if (alert) await ctx.db.patch(alert._id, { resolvedAt: Date.now() });
  }
} });
export const checkFailed = internalMutation({ args: { reference: v.string() }, handler: async (ctx, args) => {
  const p = await ctx.db.query("walletDeposits").withIndex("by_reference", q => q.eq("reference", args.reference)).unique();
  if (!p) return;
  await ctx.db.patch(p._id, { nextCheckAt: Date.now() + 300000 });
  if (Date.now() - p.createdAt > 900000) await paymentAlert(ctx, p.reference, `Unable to verify deposit ${p.reference}. Reference preserved for reconciliation.`);
} });
export const reconcileDeposit = internalAction({ args: { reference: v.string() }, handler: async (ctx, args): Promise<void> => {
  if (!process.env.PAYSTACK_SECRET_KEY) return;
  try {
    await verifyDeposit(ctx, args.reference);
    const p = await ctx.runQuery(internal.wallet.depositByReference, args);
    if (p?.providerTransactionId && p.creditedAt) {
      const response = await fetch(`https://api.paystack.co/dispute/transaction/${encodeURIComponent(p.providerTransactionId)}`, { headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` }, signal: AbortSignal.timeout(15000) });
      const body = await response.json();
      if (!response.ok || body?.status !== true || !Array.isArray(body.data)) fail("Unable to check deposit disputes.");
      for (const dispute of body.data) {
        if (String(dispute.transaction?.id) !== p.providerTransactionId || dispute.transaction?.reference !== p.reference) fail("Dispute transaction mismatch.");
        if (dispute.status !== "resolved" || dispute.resolution !== "declined") await ctx.runMutation(internal.wallet.flagRisk, { reference: p.reference, eventId: `dispute-${dispute.id}`, reversed: false });
      }
    }
  } catch { await ctx.runMutation(internal.wallet.checkFailed, args); }
} });
export const sweepDeposits = internalMutation({ args: {}, handler: async (ctx) => {
  const rows = await ctx.db.query("walletDeposits").withIndex("by_nextCheckAt", q => q.gt("nextCheckAt", 0).lte("nextCheckAt", Date.now())).take(100);
  for (const p of rows) {
    await ctx.db.patch(p._id, { nextCheckAt: Date.now() + 300000 });
    await ctx.scheduler.runAfter(0, internal.wallet.reconcileDeposit, { reference: p.reference });
  }
} });
// A signed risk event immediately freezes spending and undispatched payouts.
// Resolution remains a finance review; a late success cannot silently unfreeze funds.
export const flagRisk = internalMutation({ args: { reference: v.string(), eventId: v.string(), reversed: v.boolean() }, handler: async (ctx, args) => {
  const p = await ctx.db.query("walletDeposits").withIndex("by_reference", q => q.eq("reference", args.reference)).unique();
  if (!p) {
    const payment = await ctx.db.query("payments").withIndex("by_reference", q => q.eq("reference", args.reference)).unique();
    if (payment) {
      await ctx.db.patch(payment._id, { quarantined: true });
      await ctx.db.patch(payment.shipmentId, { paymentStatus: "reconciliation_required", updatedAt: Date.now() });
    }
    await paymentAlert(ctx, `risk-${args.reference}`, `Provider risk event ${args.eventId} for ${args.reference}. Reconcile the funds and any outgoing transfer.`);
    return;
  }
  const user = await ctx.db.get(p.userId); if (!user) fail("Deposit owner not found.");
  const debit = args.reversed && p.creditedAt ? (p.amountKobo - (p.reversedKobo ?? 0)) / 100 : 0;
  await ctx.db.patch(p._id, { riskVersion: (p.riskVersion ?? 0) + 1, disputedAt: p.disputedAt ?? Date.now(), ...(args.reversed ? { reversedAt: p.reversedAt ?? Date.now(), reversedKobo: p.amountKobo } : {}) });
  await ctx.db.patch(user._id, { walletBlocked: true, walletBalanceNaira: (user.walletBalanceNaira ?? 0) - debit, walletVerifiedBalanceNaira: (user.walletVerifiedBalanceNaira ?? 0) - debit });
  await paymentAlert(ctx, `risk-${p.reference}`, `Provider risk event ${args.eventId} for ${p.reference}. Wallet and undispatched payouts frozen. ${debit ? "Reversed funds debited; any negative balance is debt." : "Review the provider dispute before releasing funds."}`);
} });

export const getUserForTopUp = internalQuery({
  args: { sub: v.string() },
  handler: async (ctx, args) => {
    return userBySubject(ctx, args.sub);
  },
});

export const depositByProviderId = internalQuery({ args: { providerTransactionId: v.string() }, handler: async (ctx, args) => ctx.db.query("walletDeposits").withIndex("by_providerTransactionId", q => q.eq("providerTransactionId", args.providerTransactionId)).unique() });
export const recordProviderRefund = internalMutation({ args: { reference: v.string(), providerId: v.string(), providerTransactionId: v.string(), amountKobo: v.number(), currency: v.string() }, handler: async (ctx, args) => {
  const p = await ctx.db.query("walletDeposits").withIndex("by_reference", q => q.eq("reference", args.reference)).unique();
  if (!p || !p.creditedAt || p.providerTransactionId !== args.providerTransactionId || args.currency !== "NGN" || !Number.isSafeInteger(args.amountKobo) || args.amountKobo <= 0 || args.amountKobo > p.amountKobo) fail("Provider refund does not match a credited deposit.");
  const existing = await ctx.db.query("walletReversals").withIndex("by_providerId", q => q.eq("providerId", args.providerId)).unique();
  if (existing) {
    if (existing.reference !== args.reference || existing.amountKobo !== args.amountKobo) fail("Provider refund ID mismatch.");
    return;
  }
  const user = await ctx.db.get(p.userId); if (!user) fail("Deposit owner not found.");
  // A fully reversed transaction may subsequently emit individual refund events.
  const debitKobo = Math.min(args.amountKobo, p.amountKobo - (p.reversedKobo ?? 0));
  await ctx.db.insert("walletReversals", { reference: p.reference, providerId: args.providerId, amountKobo: args.amountKobo, createdAt: Date.now() });
  await ctx.db.patch(p._id, { riskVersion: (p.riskVersion ?? 0) + 1, disputedAt: p.disputedAt ?? Date.now(), reversedKobo: (p.reversedKobo ?? 0) + debitKobo });
  await ctx.db.patch(user._id, { walletBlocked: true, walletBalanceNaira: Math.round((user.walletBalanceNaira ?? 0) * 100 - debitKobo) / 100, walletVerifiedBalanceNaira: Math.round((user.walletVerifiedBalanceNaira ?? 0) * 100 - debitKobo) / 100 });
  await paymentAlert(ctx, `risk-${p.reference}`, `Paystack refunded ${args.amountKobo} kobo from ${p.reference}. Wallet debited ${debitKobo} kobo and frozen for review of any held funds or payouts.`);
  await audit(ctx, null, "wallet.provider_refund", `Verified refund ${args.providerId}; wallet debit ${debitKobo} kobo.`);
} });
export const raiseAlert = internalMutation({ args: { key: v.string(), detail: v.string() }, handler: async (ctx, args) => paymentAlert(ctx, args.key, args.detail) });

export const reviewableDeposit = internalQuery({ args: { subject: v.string(), reference: v.string() }, handler: async (ctx, args) => {
  const admin = await userBySubject(ctx, args.subject); if (!isAdmin(admin)) fail("Administrator access required.");
  return ctx.db.query("walletDeposits").withIndex("by_reference", q => q.eq("reference", args.reference)).unique();
} });
export const clearDisputeHold = internalMutation({ args: { subject: v.string(), reference: v.string(), riskVersion: v.number(), note: v.string() }, handler: async (ctx, args) => {
  const admin = await userBySubject(ctx, args.subject); if (!isAdmin(admin)) fail("Administrator access required.");
  const p = await ctx.db.query("walletDeposits").withIndex("by_reference", q => q.eq("reference", args.reference)).unique();
  if (!p || !p.creditedAt || p.reversedAt || p.reversedKobo || (p.riskVersion ?? 0) !== args.riskVersion) fail("The risk state changed or includes reversed funds. Reconcile before release.");
  const user = await ctx.db.get(p.userId); if (!user || (user.walletVerifiedBalanceNaira ?? 0) < 0) fail("Wallet debt must be reconciled first.");
  await ctx.db.patch(p._id, { disputedAt: undefined });
  const deposits = await ctx.db.query("walletDeposits").withIndex("by_user_and_status", q => q.eq("userId", p.userId)).collect();
  if (!deposits.some(d => d.disputedAt || d.reversedAt)) await ctx.db.patch(user._id, { walletBlocked: false });
  const alert = await ctx.db.query("paymentAlerts").withIndex("by_key", q => q.eq("key", `risk-${p.reference}`)).unique();
  if (alert) await ctx.db.patch(alert._id, { resolvedAt: Date.now() });
  await audit(ctx, admin, "wallet.dispute_reviewed", `Paystack confirms resolved, declined disputes for ${p.reference}. ${args.note}`);
} });
export const reviewDispute = action({ args: { reference: v.string(), note: v.string() }, handler: async (ctx, args): Promise<void> => {
  if (args.note.trim().length < 20 || args.note.length > 2000) fail("Add a review note between 20 and 2000 characters.");
  const sub = await subject(ctx);
  const p = await ctx.runQuery(internal.wallet.reviewableDeposit, { subject: sub, reference: args.reference });
  if (!p?.providerTransactionId || !p.disputedAt || p.reversedAt || p.reversedKobo) fail("This deposit requires refund or debt reconciliation.");
  await ctx.runMutation(internal.wallet.rateLimit, { subject: sub, kind: "risk-review" });
  const key = process.env.PAYSTACK_SECRET_KEY; if (!key || p.providerMode !== paymentMode()) fail("Payment environment unavailable.");
  const get = async (path: string) => {
    const response = await fetch(`https://api.paystack.co${path}`, { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(15000) });
    const body = await response.json(); if (!response.ok || body?.status !== true) fail("Paystack could not confirm the review."); return body.data;
  };
  const transaction = await get(`/transaction/verify/${encodeURIComponent(p.reference)}`);
  if (transaction?.status !== "success" || String(transaction.id) !== p.providerTransactionId || transaction.reference !== p.reference || transaction.amount !== p.amountKobo || transaction.currency !== "NGN") fail("Deposit is not confirmed as paid.");
  const disputes = await get(`/dispute/transaction/${encodeURIComponent(p.providerTransactionId)}`);
  if (!Array.isArray(disputes) || !disputes.length || disputes.some(d => d.status !== "resolved" || d.resolution !== "declined" || d.transaction?.reference !== p.reference || String(d.transaction?.id) !== p.providerTransactionId)) fail("All disputes must be resolved in the merchant's favour before release.");
  await ctx.runMutation(internal.wallet.clearDisputeHold, { subject: sub, reference: p.reference, riskVersion: p.riskVersion ?? 0, note: args.note.trim() });
} });
