import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { action, internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import type { MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { audit, fail, requireActive, requireUser, subject, userBySubject } from "./lib";

type TopUpInitialization = { mode: "provider"; url: string; reference: string };

export const balance = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    return { balanceNaira: user.walletBalanceNaira ?? 0 };
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

export const reserveTopUp = internalMutation({
  args: { userId: v.id("users"), reference: v.string(), amountKobo: v.number() },
  handler: async (ctx, args) => {
    if (!Number.isSafeInteger(args.amountKobo) || args.amountKobo <= 0 || args.amountKobo % 100 !== 0) fail("Invalid deposit amount.");
    return ctx.db.insert("walletDeposits", { ...args, status: "pending", createdAt: Date.now() });
  },
});

export const depositByReference = internalQuery({
  args: { reference: v.string() },
  handler: async (ctx, args) => ctx.db.query("walletDeposits").withIndex("by_reference", q => q.eq("reference", args.reference)).unique(),
});

export const recordTopUp = internalMutation({
  args: {
    userId: v.id("users"),
    amountNaira: v.number(),
    reference: v.string(),
  },
  handler: async (ctx, args) => {
    const deposit = await ctx.db.query("walletDeposits").withIndex("by_reference", q => q.eq("reference", args.reference)).unique();
    if (!deposit || deposit.userId !== args.userId || !Number.isSafeInteger(args.amountNaira) || args.amountNaira <= 0 || deposit.amountKobo !== args.amountNaira * 100) fail("Deposit does not match the saved payment.");
    const existing = await ctx.db
      .query("walletTransactions")
      .withIndex("by_reference", q => q.eq("reference", args.reference))
      .unique();
    if (existing) return;

    const user = await ctx.db.get(args.userId);
    if (!user) fail("User not found.");

    const currentBalance = user.walletBalanceNaira ?? 0;
    const nextBalance = currentBalance + args.amountNaira;

    await ctx.db.patch(deposit._id, { status: "paid" });
    await ctx.db.patch(user._id, { walletBalanceNaira: nextBalance });
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

export async function deductForShipment(
  ctx: MutationCtx,
  user: Doc<"users">,
  shipmentId: Id<"shipments">,
  amountNaira: number,
) {
  const current = user.walletBalanceNaira ?? 0;
  if (current < amountNaira) {
    fail(`Insufficient wallet balance. You have ₦${current.toLocaleString()} but ₦${amountNaira.toLocaleString()} is required. Top up your wallet to post this parcel.`);
  }

  const nextBalance = current - amountNaira;
  await ctx.db.patch(user._id, { walletBalanceNaira: nextBalance });
  await ctx.db.insert("walletTransactions", {
    userId: user._id,
    kind: "parcel_hold",
    amountNaira,
    reference: `hold-${shipmentId.slice(-12)}-${Date.now()}`,
    shipmentId,
    createdAt: Date.now(),
    note: `Delivery fee of ₦${amountNaira.toLocaleString()} held for parcel`,
  });
  await audit(ctx, user, "wallet.held", `₦${amountNaira.toLocaleString()} held for parcel ${shipmentId}. Remaining balance: ₦${nextBalance.toLocaleString()}`, shipmentId);
}

export async function refundForShipment(
  ctx: MutationCtx,
  user: Doc<"users">,
  shipmentId: Id<"shipments">,
  amountNaira: number,
  reason: string,
) {
  const current = user.walletBalanceNaira ?? 0;
  const nextBalance = current + amountNaira;
  await ctx.db.patch(user._id, { walletBalanceNaira: nextBalance });
  await ctx.db.insert("walletTransactions", {
    userId: user._id,
    kind: "parcel_refund",
    amountNaira,
    reference: `refund-${shipmentId.slice(-12)}-${Date.now()}`,
    shipmentId,
    createdAt: Date.now(),
    note: `Refund of ₦${amountNaira.toLocaleString()}: ${reason}`,
  });
  await audit(ctx, user, "wallet.refunded", `₦${amountNaira.toLocaleString()} refunded to wallet for parcel ${shipmentId}. New balance: ₦${nextBalance.toLocaleString()}`, shipmentId);
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

    const reference = `wallet-${crypto.randomUUID()}`;
    const callback = process.env.PAYSTACK_CALLBACK_URL;
    if (callback) {
      let url: URL;
      try { url = new URL(callback); } catch { fail("Payment return URL is invalid."); }
      if (url.protocol !== "https:" || url.username || url.password) fail("Payment return URL must use HTTPS.");
    }
    const amountKobo = amountNaira * 100;
    await ctx.runMutation(internal.wallet.reserveTopUp, { userId: user._id, reference, amountKobo });

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

export const verifyTopUp = action({
  args: { reference: v.string() },
  handler: async (ctx, args): Promise<{ success: boolean; balanceNaira: number }> => {
    const sub = await subject(ctx);
    const user = await ctx.runQuery(internal.wallet.getUserForTopUp, { sub });
    const balanceNaira = user?.walletBalanceNaira ?? 0;
    const key = process.env.PAYSTACK_SECRET_KEY;
    if (!key) fail("Payments are not available yet. Please try again later.");
    const deposit = await ctx.runQuery(internal.wallet.depositByReference, { reference: args.reference });
    if (!user || !deposit || deposit.userId !== user._id) fail("Payment not found.");

    let response: Response;
    try {
      response = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(args.reference)}`, {
        headers: { Authorization: `Bearer ${key}` },
        signal: AbortSignal.timeout(15000),
      });
    } catch {
      fail("We could not connect to the payment provider. Please check your connection and try again.");
    }

    if (!response.ok) fail("Could not verify transaction with payment provider.");
    const body = await response.json().catch(() => null) as { status?: boolean; data?: { reference?: string; status?: string; currency?: string; amount?: number } } | null;
    const data = body?.data;

    if (body?.status !== true || !data || data.reference !== deposit.reference || data.amount !== deposit.amountKobo || data.currency !== "NGN") fail("Payment verification did not match your deposit.");
    if (data?.status === "success" && data.currency === "NGN" && typeof data.amount === "number" && Number.isSafeInteger(data.amount) && user) {
      const amountNaira = data.amount / 100;
      await ctx.runMutation(internal.wallet.recordTopUp, {
        userId: user._id,
        amountNaira,
        reference: args.reference,
      });
      const updated = await ctx.runQuery(internal.wallet.getUserForTopUp, { sub });
      return { success: true, balanceNaira: updated?.walletBalanceNaira ?? 0 };
    }

    return { success: false, balanceNaira };
  },
});

export const getUserForTopUp = internalQuery({
  args: { sub: v.string() },
  handler: async (ctx, args) => {
    return userBySubject(ctx, args.sub);
  },
});
