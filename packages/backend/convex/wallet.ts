import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { action, internalAction, internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { feeQuote } from "./financeSchema";
import { internal } from "./_generated/api";
import type { MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { audit, fail, requireActive, requireAdmin, isAdmin, notify, requireTransactionalVerification, requireUser, subject, userBySubject } from "./lib";
import { decodeProviderText } from "./providerText";
import { renderTransactionPinCodeEmail, sendBrandedEmail } from "./emails";

export function paymentMode(): "live" | "test" { return process.env.PAYSTACK_SECRET_KEY?.startsWith("sk_live_") ? "live" : "test"; }

type TopUpInitialization = { mode: "virtual_account"; reference: string; externalReference: string; accountNumber: string; accountName: string; amount: number; expiresAt: string };

function transactionPinPepper() {
  const pepper = process.env.TRANSACTION_PIN_PEPPER?.trim();
  if (!pepper || pepper.length < 32) fail("Transaction PIN security is not configured.");
  return pepper;
}

async function transactionPinDigest(pin: string, salt: string) {
  const bytes = new TextEncoder().encode(`${transactionPinPepper()}:${salt}:${pin}`);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return Array.from(digest, byte => byte.toString(16).padStart(2, "0")).join("");
}

function v4WalletConfig() {
  const baseUrl = (process.env.V4_API_URL ?? process.env.V4_VERIFICATION_API_URL ?? process.env.V4_VERIFICATION_BASE_URL ?? "").replace(/\/$/, "");
  const key = process.env.V4_VERIFICATION_API_KEY;
  const secret = process.env.V4_VERIFICATION_API_SECRET;
  if (!baseUrl || !key || !secret) fail("Wallet funding is not available yet. Please try again later.");
  return { baseUrl, key, secret };
}

export const balance = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    return { balanceNaira: Math.max(0, user.walletVerifiedBalanceNaira ?? 0), blocked: !!user.walletBlocked };
  },
});

export const transactionPinStatus = query({ args: {}, handler: async (ctx) => {
  const user = await requireUser(ctx);
  return { configured: !!user.transactionPinHash && !!user.transactionPinSalt, lockedUntil: user.transactionPinLockedUntil };
} });

export const getTransactionPinEmailContext = internalQuery({ args: { subject: v.string() }, handler: async (ctx, args) => {
  const user = await userBySubject(ctx, args.subject);
  requireActive(user);
  if (!user.transactionPinHash || !user.transactionPinSalt) fail("Create your transaction PIN first.");
  return { userId: user._id, name: user.name };
} });

export const createTransactionPinChallenge = internalMutation({
  args: { userId: v.id("users"), codeHash: v.string(), salt: v.string(), expiresAt: v.number() },
  handler: async (ctx, args) => {
    const existing = await ctx.db.query("transactionPinChallenges").withIndex("by_user", q => q.eq("userId", args.userId)).collect();
    const now = Date.now();
    for (const challenge of existing) {
      if (!challenge.consumedAt) await ctx.db.patch(challenge._id, { consumedAt: now });
    }
    return ctx.db.insert("transactionPinChallenges", { ...args, attempts: 0, createdAt: now });
  },
});

export const consumeTransactionPinChallenge = internalMutation({
  args: { challengeId: v.id("transactionPinChallenges") },
  handler: async (ctx, args) => {
    const challenge = await ctx.db.get(args.challengeId);
    if (challenge && !challenge.consumedAt) await ctx.db.patch(challenge._id, { consumedAt: Date.now() });
  },
});

function maskEmail(email: string) {
  const [local, domain] = email.split("@");
  if (!local || !domain) return "your account email";
  return `${local.slice(0, 2)}${"*".repeat(Math.max(2, Math.min(6, local.length - 2)))}@${domain}`;
}

export const requestTransactionPinChangeCode = action({
  args: {},
  handler: async (ctx): Promise<{ sentTo: string }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) fail("Sign in required.");
    const email = identity.email?.trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail("A verified account email is required to change your transaction PIN.");
    const sub = identity.subject.split("|")[0]!;
    const user = await ctx.runQuery(internal.wallet.getTransactionPinEmailContext, { subject: sub });
    await ctx.runMutation(internal.wallet.rateLimit, { subject: sub, kind: "transaction-pin-code", limit: 3 });

    const values = new Uint32Array(1);
    crypto.getRandomValues(values);
    const code = String((values[0]! % 900_000) + 100_000);
    const salt = crypto.randomUUID();
    const codeHash = await transactionPinDigest(code, salt);
    const challengeId = await ctx.runMutation(internal.wallet.createTransactionPinChallenge, {
      userId: user.userId,
      codeHash,
      salt,
      expiresAt: Date.now() + 10 * 60 * 1000,
    });
    const appUrl = (process.env.SITE_URL?.trim() || "https://usepassenger.com").replace(/\/$/, "");
    const message = renderTransactionPinCodeEmail({ name: user.name, appUrl, code });
    try {
      await sendBrandedEmail({ to: email, subject: "Your Passenger transaction PIN code", ...message });
    } catch (cause) {
      await ctx.runMutation(internal.wallet.consumeTransactionPinChallenge, { challengeId });
      throw cause;
    }
    return { sentTo: maskEmail(email) };
  },
});

export const setTransactionPin = mutation({ args: {
  pin: v.string(),
  currentPin: v.optional(v.string()),
  emailCode: v.optional(v.string()),
  resetWithEmail: v.optional(v.boolean()),
}, handler: async (ctx, args) => {
  const user = await requireUser(ctx);
  requireActive(user);
  if (!/^\d{4}$/.test(args.pin)) fail("Choose a 4-digit transaction PIN.");
  if (user.transactionPinHash && user.transactionPinSalt) {
    const now = Date.now();
    const challenge = await ctx.db.query("transactionPinChallenges").withIndex("by_user", q => q.eq("userId", user._id)).order("desc").first();
    if (!challenge || challenge.consumedAt) return { success: false, error: "Request a new email code before changing your PIN." } as const;
    if (challenge.expiresAt <= now) {
      await ctx.db.patch(challenge._id, { consumedAt: now });
      return { success: false, error: "That email code has expired. Request a new one." } as const;
    }
    const emailCode = args.emailCode?.trim() ?? "";
    const codeMatches = /^\d{6}$/.test(emailCode) && await transactionPinDigest(emailCode, challenge.salt) === challenge.codeHash;
    if (!codeMatches) {
      const attempts = challenge.attempts + 1;
      const exhausted = attempts >= 5;
      await ctx.db.patch(challenge._id, { attempts, consumedAt: exhausted ? now : undefined });
      return { success: false, error: exhausted ? "That email code can no longer be used. Request a new one." : `That email code is incorrect. ${5 - attempts} attempt${5 - attempts === 1 ? "" : "s"} remaining.` } as const;
    }
    if (!args.resetWithEmail) {
      if (user.transactionPinLockedUntil && user.transactionPinLockedUntil > now) return { success: false, error: "Transaction PIN is temporarily locked. Use Forgot PIN to reset it with your email code, or try again later." } as const;
      const matches = !!args.currentPin && /^\d{4}$/.test(args.currentPin) && await transactionPinDigest(args.currentPin, user.transactionPinSalt) === user.transactionPinHash;
      if (!matches) {
        const attempts = (user.transactionPinFailedAttempts ?? 0) + 1;
        const lockedUntil = attempts >= 5 ? now + 15 * 60 * 1000 : undefined;
        await ctx.db.patch(user._id, { transactionPinFailedAttempts: lockedUntil ? 0 : attempts, transactionPinLockedUntil: lockedUntil });
        return { success: false, error: lockedUntil ? "Transaction PIN is locked for 15 minutes after repeated incorrect attempts. You can reset it using Forgot PIN." : `Your current transaction PIN is incorrect. ${5 - attempts} attempt${5 - attempts === 1 ? "" : "s"} remaining.` } as const;
      }
    }
    await ctx.db.patch(challenge._id, { consumedAt: now });
  }
  const salt = crypto.randomUUID();
  await ctx.db.patch(user._id, {
    transactionPinHash: await transactionPinDigest(args.pin, salt),
    transactionPinSalt: salt,
    transactionPinSetAt: Date.now(),
    transactionPinFailedAttempts: 0,
    transactionPinLockedUntil: undefined,
  });
  const event = !user.transactionPinHash ? "wallet.transaction_pin_created" : args.resetWithEmail ? "wallet.transaction_pin_reset" : "wallet.transaction_pin_changed";
  await audit(ctx, user, event, "Transaction PIN updated.");
  return { success: true, configured: true } as const;
} });

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
export const rateLimit = internalMutation({ args: { subject: v.string(), kind: v.string(), limit: v.optional(v.number()) }, handler: async (ctx, args) => {
  const user = await userBySubject(ctx, args.subject);
  await paymentRateLimit(ctx, `${user._id}:${args.kind}`, args.limit);
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
export const reserveV4TopUp = internalMutation({
  args: { userId: v.id("users"), reference: v.string(), amountKobo: v.number() },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId); if (!user) fail("User not found."); requireActive(user);
    if (user.walletBlocked) fail("Your wallet is under payment review. Contact support.");
    const existing = await ctx.db.query("walletDeposits").withIndex("by_user_and_status", q => q.eq("userId", user._id).eq("status", "pending")).first();
    if (existing) return { deposit: existing, initialize: false };
    const id = await ctx.db.insert("walletDeposits", { ...args, provider: "v4", paymentStatus: "pending", status: "pending", createdAt: Date.now() });
    return { deposit: (await ctx.db.get(id))!, initialize: true };
  },
});
export const attachV4TopUp = internalMutation({
  args: { reference: v.string(), externalReference: v.string(), accountNumber: v.string(), accountName: v.string(), expiresAt: v.string() },
  handler: async (ctx, args) => {
    const p = await ctx.db.query("walletDeposits").withIndex("by_reference", q => q.eq("reference", args.reference)).unique();
    if (!p) fail("Deposit not found.");
    await ctx.db.patch(p._id, { externalReference: args.externalReference, accountNumber: args.accountNumber, accountName: args.accountName, expiresAt: args.expiresAt });
  },
});
export const pendingDeposit = query({ args: {}, handler: async (ctx) => {
  const user = await requireUser(ctx);
  const p = await ctx.db.query("walletDeposits").withIndex("by_user_and_status", q => q.eq("userId", user._id).eq("status", "pending")).first();
  return p ? { reference: p.reference, amount: p.amountKobo / 100, url: p.url ?? "", externalReference: p.externalReference, accountNumber: p.accountNumber, accountName: p.accountName ? decodeProviderText(p.accountName) : p.accountName, expiresAt: p.expiresAt, paymentStatus: p.paymentStatus ?? "pending" } : null;
} });

export const depositByReference = internalQuery({
  args: { reference: v.string() },
  handler: async (ctx, args) => ctx.db.query("walletDeposits").withIndex("by_reference", q => q.eq("reference", args.reference)).unique(),
});
export const depositByExternalReference = internalQuery({ args: { externalReference: v.string() }, handler: async (ctx, args) => ctx.db.query("walletDeposits").withIndex("by_externalReference", q => q.eq("externalReference", args.externalReference)).unique() });

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

    if (deposit.provider !== "v4" && (deposit.providerMode !== paymentMode() || user.walletMode && user.walletMode !== deposit.providerMode)) fail("Payment environment mismatch. Contact support.");
    const sameTransaction = await ctx.db.query("walletDeposits").withIndex("by_providerTransactionId", q => q.eq("providerTransactionId", args.providerTransactionId)).unique();
    if (sameTransaction && sameTransaction._id !== deposit._id) fail("Provider transaction already belongs to another deposit.");
    const currentBalance = user.walletBalanceNaira ?? 0;
    const nextBalance = currentBalance + args.amountNaira;
    if (!Number.isSafeInteger(nextBalance) || !Number.isSafeInteger((user.walletVerifiedBalanceNaira ?? 0) + args.amountNaira)) fail("Wallet balance limit exceeded.");

    await ctx.db.patch(deposit._id, { status: "paid", creditedAt: Date.now(), providerTransactionId: args.providerTransactionId, nextCheckAt: Date.now() + 86400000 });
    await ctx.db.patch(user._id, { walletBalanceNaira: nextBalance, ...(deposit.provider === "v4" ? {} : { walletMode: deposit.providerMode }), walletVerifiedBalanceNaira: (user.walletVerifiedBalanceNaira ?? 0) + args.amountNaira });
    await ctx.db.insert("walletTransactions", {
      userId: user._id,
      kind: "top_up",
      amountNaira: args.amountNaira,
      reference: args.reference,
      createdAt: Date.now(),
      note: `Wallet funded with ₦${args.amountNaira.toLocaleString()}`,
    });
    await notify(ctx, user._id, "Wallet top-up confirmed", `₦${args.amountNaira.toLocaleString()} was added to your Passenger wallet.`);
    await audit(ctx, user, "wallet.top_up", `Added ₦${args.amountNaira.toLocaleString()} to wallet. New balance: ₦${nextBalance.toLocaleString()}`);
  },
});

export const reserveWithdrawal = internalMutation({ args: { subject: v.string(), amountNaira: v.number(), transactionPin: v.string() }, handler: async (ctx, args) => {
  const user = await userBySubject(ctx, args.subject);
  requireActive(user);
  await requireTransactionalVerification(ctx, user._id);
  if (!Number.isSafeInteger(args.amountNaira) || args.amountNaira < 100) return { error: "Enter a whole-naira withdrawal amount of at least ₦100." } as const;
  if (user.walletBlocked) return { error: "Your wallet is under payment review. Contact support." } as const;
  if (!user.transactionPinHash || !user.transactionPinSalt) return { error: "Create your transaction PIN before withdrawing." } as const;
  if (user.transactionPinLockedUntil && user.transactionPinLockedUntil > Date.now()) return { error: "Transaction PIN is temporarily locked. Try again later." } as const;
  const pinMatches = /^\d{4}$/.test(args.transactionPin) && await transactionPinDigest(args.transactionPin, user.transactionPinSalt) === user.transactionPinHash;
  if (!pinMatches) {
    const attempts = (user.transactionPinFailedAttempts ?? 0) + 1;
    const lockedUntil = attempts >= 5 ? Date.now() + 15 * 60 * 1000 : undefined;
    await ctx.db.patch(user._id, { transactionPinFailedAttempts: lockedUntil ? 0 : attempts, transactionPinLockedUntil: lockedUntil });
    return { error: lockedUntil ? "Transaction PIN is locked for 15 minutes after repeated incorrect attempts." : `Incorrect transaction PIN. ${5 - attempts} attempt${5 - attempts === 1 ? "" : "s"} remaining.` } as const;
  }
  const bank = await ctx.db.query("bankAccounts").withIndex("by_user", q => q.eq("userId", user._id)).first();
  if (!bank?.verifiedAt || bank.bankingProvider !== "v4" || !bank.nameEnquiryReference || !bank.encryptedAccountNumber || !bank.accountNumberIv) return { error: "Add and verify your payout account before withdrawing." } as const;
  const currentBalance = user.walletVerifiedBalanceNaira ?? 0;
  if (args.amountNaira > Math.floor(currentBalance)) return { error: "Withdrawal amount exceeds your available balance." } as const;
  const now = Date.now();
  const reference = `withdrawal-${crypto.randomUUID()}`;
  const withdrawalId = await ctx.db.insert("walletWithdrawals", {
    userId: user._id,
    amountNaira: args.amountNaira,
    reference,
    status: "prepared",
    bankCode: bank.bankCode,
    accountName: decodeProviderText(bank.accountName),
    last4: bank.last4,
    nameEnquiryReference: bank.nameEnquiryReference,
    encryptedAccountNumber: bank.encryptedAccountNumber,
    accountNumberIv: bank.accountNumberIv,
    createdAt: now,
    updatedAt: now,
  });
  await ctx.db.patch(user._id, {
    walletBalanceNaira: (user.walletBalanceNaira ?? 0) - args.amountNaira,
    walletVerifiedBalanceNaira: currentBalance - args.amountNaira,
    transactionPinFailedAttempts: 0,
    transactionPinLockedUntil: undefined,
  });
  await audit(ctx, user, "wallet.withdrawal_reserved", `Reserved ₦${args.amountNaira.toLocaleString()} for withdrawal ${reference}.`);
  return { withdrawalId, reference } as const;
} });

export const withdrawalById = internalQuery({ args: { withdrawalId: v.id("walletWithdrawals") }, handler: async (ctx, args) => ctx.db.get(args.withdrawalId) });

export const markWithdrawalPending = internalMutation({ args: { withdrawalId: v.id("walletWithdrawals") }, handler: async (ctx, args) => {
  const withdrawal = await ctx.db.get(args.withdrawalId);
  if (!withdrawal || withdrawal.status !== "prepared") return withdrawal;
  await ctx.db.patch(withdrawal._id, { status: "pending", updatedAt: Date.now() });
  return ctx.db.get(withdrawal._id);
} });

export const finishWithdrawal = internalMutation({ args: { withdrawalId: v.id("walletWithdrawals"), status: v.union(v.literal("success"), v.literal("uncertain")), providerId: v.optional(v.string()), providerStatus: v.optional(v.string()), error: v.optional(v.string()) }, handler: async (ctx, args) => {
  const withdrawal = await ctx.db.get(args.withdrawalId);
  if (!withdrawal || withdrawal.status === "success") return withdrawal;
  await ctx.db.patch(withdrawal._id, { status: args.status, providerId: args.providerId, providerStatus: args.providerStatus, lastError: args.error, updatedAt: Date.now() });
  if (args.status === "success") {
    if (!await ctx.db.query("walletTransactions").withIndex("by_reference", q => q.eq("reference", withdrawal.reference)).unique()) {
      await ctx.db.insert("walletTransactions", { userId: withdrawal.userId, kind: "withdrawal", amountNaira: withdrawal.amountNaira, reference: withdrawal.reference, createdAt: Date.now(), note: `Withdrawal to ${withdrawal.accountName} ending ${withdrawal.last4}` });
    }
    await notify(ctx, withdrawal.userId, "Payout sent", `₦${withdrawal.amountNaira.toLocaleString()} was sent to your verified bank account.`);
  } else {
    await paymentAlert(ctx, withdrawal.reference, `Withdrawal ${withdrawal.reference} has an uncertain provider outcome. Reconcile before retrying or returning the reserved balance.`);
  }
  return ctx.db.get(withdrawal._id);
} });

export const requestWithdrawal = action({ args: { amountNaira: v.number(), transactionPin: v.string() }, handler: async (ctx, args): Promise<{ reference: string; status: string }> => {
  const transferPin = process.env.V4_TRANSFER_TRANSACTION_PIN?.trim();
  if (!transferPin || !/^\d{4,12}$/.test(transferPin)) fail("Secure withdrawals are not configured.");
  v4WalletConfig();
  const sub = await subject(ctx);
  await ctx.runMutation(internal.wallet.rateLimit, { subject: sub, kind: "withdrawal" });
  const reserved = await ctx.runMutation(internal.wallet.reserveWithdrawal, { subject: sub, amountNaira: args.amountNaira, transactionPin: args.transactionPin });
  if ("error" in reserved) fail(reserved.error ?? "Withdrawal could not be reserved.");
  return ctx.runAction(internal.finance.submitWithdrawal, { withdrawalId: reserved.withdrawalId });
} });

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
  await notify(ctx, user._id, "Wallet refund completed", `₦${amountNaira.toLocaleString()} was returned to your Passenger wallet.`, shipmentId);
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

    const email = identity.email ?? user.email;
    if (typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      fail("A verified email is required for wallet top-up.");
    }

    await ctx.runMutation(internal.wallet.rateLimit, { subject: sub, kind: "initialize" });
    const reference = `wallet-${crypto.randomUUID()}`;
    const amountKobo = amountNaira * 100;
    const reserved = await ctx.runMutation(internal.wallet.reserveV4TopUp, { userId: user._id, reference, amountKobo });
    if (!reserved.initialize) {
      if (reserved.deposit.amountKobo !== amountKobo) fail("Finish or check your existing deposit before changing the amount.");
      if (reserved.deposit.externalReference && reserved.deposit.accountNumber && reserved.deposit.accountName && reserved.deposit.expiresAt) return { mode: "virtual_account", reference: reserved.deposit.reference, externalReference: reserved.deposit.externalReference, accountNumber: reserved.deposit.accountNumber, accountName: decodeProviderText(reserved.deposit.accountName), amount: reserved.deposit.amountKobo / 100, expiresAt: reserved.deposit.expiresAt };
      fail("Your existing deposit is being checked. Open your wallet to check its status; another deposit was not created.");
    }
    const { baseUrl, key, secret } = v4WalletConfig();
    let response: Response;
    try { response = await fetch(`${baseUrl}/wallet/topup`, { method: "POST", headers: { "X-API-Key": key, "X-API-Secret": secret, "Idempotency-Key": reference, "Content-Type": "application/json" }, body: JSON.stringify({ email, name: user.name, phoneNumber: user.phone, amount: amountNaira, metadata: { passengerReference: reference, subject: sub } }), signal: AbortSignal.timeout(15000) }); } catch { fail("We could not connect to the wallet provider. Please try again."); }
    const body = await response.json().catch(() => null) as { success?: boolean; data?: { externalReference?: string; accountNumber?: string; accountName?: string; amount?: number; expiresAt?: string } } | null;
    const data = body?.data;
    if (!response.ok || body?.success !== true || !data?.externalReference || !data.accountNumber || !data.accountName || typeof data.amount !== "number" || data.amount !== amountNaira || !data.expiresAt) fail("Could not create a virtual account for this top-up.");
    const accountName = decodeProviderText(data.accountName);
    await ctx.runMutation(internal.wallet.attachV4TopUp, { reference, externalReference: data.externalReference, accountNumber: data.accountNumber, accountName, expiresAt: data.expiresAt });
    return { mode: "virtual_account", reference, externalReference: data.externalReference, accountNumber: data.accountNumber, accountName, amount: data.amount, expiresAt: data.expiresAt };
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
    const success = deposit.provider === "v4" ? await verifyV4Deposit(ctx, deposit.externalReference!, deposit.amountKobo / 100) : await verifyDeposit(ctx, args.reference);
    const updated = await ctx.runQuery(internal.wallet.getUserForTopUp, { sub });
    return { success, balanceNaira: Math.max(0, updated.walletVerifiedBalanceNaira ?? 0) };
  },
});

async function verifyV4Deposit(ctx: import("./_generated/server").ActionCtx, externalReference: string, amountNaira: number) {
  const { baseUrl, key, secret } = v4WalletConfig();
  const response = await fetch(`${baseUrl}/wallet/topup/${encodeURIComponent(externalReference)}`, { headers: { "X-API-Key": key, "X-API-Secret": secret }, signal: AbortSignal.timeout(15000) });
  const body = await response.json().catch(() => null) as { success?: boolean; data?: { externalReference?: string; amount?: number; paymentStatus?: string; paymentReference?: string } } | null;
  const data = body?.data;
  if (!response.ok || body?.success !== true || !data || data.externalReference !== externalReference || data.amount !== amountNaira) fail("Payment verification did not match your deposit.");
  if (data.paymentStatus === "completed") {
    if (!data.paymentReference) fail("Completed payment is missing its provider reference.");
    const deposit = await ctx.runQuery(internal.wallet.depositByExternalReference, { externalReference });
    if (!deposit) fail("Payment not found.");
    await ctx.runMutation(internal.wallet.recordTopUp, { userId: deposit.userId, reference: deposit.reference, amountNaira, providerTransactionId: data.paymentReference });
    return true;
  }
  return false;
}

export const processV4Event = internalMutation({
  args: { externalReference: v.string(), paymentReference: v.optional(v.string()), amount: v.number(), status: v.string(), responseCode: v.optional(v.string()), responseMessage: v.optional(v.string()), sessionId: v.optional(v.string()) },
  handler: async (ctx, args): Promise<{ received: boolean; credited: boolean; alreadyProcessed?: boolean; reason?: string }> => {
    const p = await ctx.db.query("walletDeposits").withIndex("by_externalReference", q => q.eq("externalReference", args.externalReference)).unique();
    if (!p) return { received: true, credited: false, reason: "unknown_reference" };
    const approved = args.status.toLowerCase() === "completed" && (!args.responseCode || args.responseCode === "00");
    if (!approved) {
      if (!p.creditedAt) await ctx.db.patch(p._id, { status: "failed", paymentStatus: args.status.toLowerCase() === "reversed" ? "refunded" : "failed", lastCheckedAt: Date.now() });
      else if (args.status.toLowerCase() === "reversed") await paymentAlert(ctx, `risk-${p.reference}`, `V4 wallet payment ${p.reference} was reversed after credit; no automatic debit was applied.`);
      return { received: true, credited: false, reason: args.status.toLowerCase() === "reversed" ? "reversed_after_credit" : "declined" };
    }
    if (args.amount !== p.amountKobo / 100) {
      if (!p.creditedAt) await ctx.db.patch(p._id, { paymentStatus: "partial", lastCheckedAt: Date.now() });
      return { received: true, credited: false, reason: "amount_mismatch" };
    }
    if (p.creditedAt) return { received: true, credited: true, alreadyProcessed: true };
    const providerTransactionId = args.paymentReference ?? args.sessionId ?? args.externalReference;
    await ctx.runMutation(internal.wallet.recordTopUp, { userId: p.userId, reference: p.reference, amountNaira: args.amount, providerTransactionId });
    await ctx.db.patch(p._id, { paymentStatus: "completed", paymentReference: args.paymentReference, lastCheckedAt: Date.now() });
    return { received: true, credited: true };
  },
});

export const receiveV4Webhook = internalAction({
  args: { body: v.string() },
  handler: async (ctx, args): Promise<{ received: boolean; credited: boolean; alreadyProcessed?: boolean; reason?: string }> => {
    const parsed = JSON.parse(args.body) as { data?: Record<string, unknown> } & Record<string, unknown>;
    const data = parsed.data && typeof parsed.data === "object" ? parsed.data : parsed;
    if (typeof data.externalReference !== "string" || typeof data.amount !== "number" || typeof data.status !== "string") fail("Invalid V4 wallet webhook payload.");
    return await ctx.runMutation(internal.wallet.processV4Event, { externalReference: data.externalReference, amount: data.amount, status: data.status, paymentReference: typeof data.paymentReference === "string" ? data.paymentReference : undefined, responseCode: typeof data.responseCode === "string" ? data.responseCode : undefined, responseMessage: typeof data.responseMessage === "string" ? data.responseMessage : undefined, sessionId: typeof data.sessionId === "string" ? data.sessionId : undefined });
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
