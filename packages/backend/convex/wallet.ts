import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { action, internalAction, internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import type { MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { audit, fail, requireActive, requireUser, subject, userBySubject } from "./lib";

type TopUpInitialization =
  | { mode: "provider"; url: string; reference: string }
  | { mode: "manual"; reference: string; balanceNaira: number };

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

export const recordTopUp = internalMutation({
  args: {
    userId: v.id("users"),
    amountNaira: v.number(),
    reference: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("walletTransactions")
      .withIndex("by_reference", q => q.eq("reference", args.reference))
      .unique();
    if (existing) return;

    const user = await ctx.db.get(args.userId);
    if (!user) fail("User not found.");

    const currentBalance = user.walletBalanceNaira ?? 0;
    const nextBalance = currentBalance + args.amountNaira;

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

    const amountNaira = Math.floor(args.amountNaira);
    if (!Number.isSafeInteger(amountNaira) || amountNaira < 100 || amountNaira > 500000) {
      fail("Enter a whole-naira amount between ₦100 and ₦500,000.");
    }

    const sub = identity.subject.split("|")[0]!;
    const user = await ctx.runQuery(internal.wallet.getUserForTopUp, { sub });
    if (!user) fail("Complete your profile first.");
    requireActive(user);

    const key = process.env.PAYSTACK_SECRET_KEY;
    if (!key) {
      const reference = `wallet-manual-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      await ctx.runMutation(internal.wallet.recordTopUp, {
        userId: user._id,
        amountNaira,
        reference,
      });
      const updated = await ctx.runQuery(internal.wallet.getUserForTopUp, { sub });
      return {
        mode: "manual",
        reference,
        balanceNaira: updated?.walletBalanceNaira ?? user.walletBalanceNaira ?? amountNaira,
      };
    }

    const email = identity.email;
    if (typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      fail("A verified email is required for wallet top-up.");
    }

    const reference = `wallet-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const callback = process.env.PAYSTACK_CALLBACK_URL;
    const amountKobo = amountNaira * 100;

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
    const body = await response.json().catch(() => null) as { status?: boolean; data?: { authorization_url?: string } } | null;
    if (body?.status !== true || !body.data?.authorization_url) {
      fail("Could not initialize payment with provider.");
    }

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
    if (!key) {
      const topUp = await ctx.runQuery(internal.wallet.topUpByReference, { reference: args.reference });
      return { success: !!topUp && topUp.userId === user?._id, balanceNaira };
    }

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
    const body = await response.json().catch(() => null) as { data?: { status?: string; currency?: string; amount?: number } } | null;
    const data = body?.data;

    if (data?.status === "success" && data.currency === "NGN" && typeof data.amount === "number" && Number.isSafeInteger(data.amount) && user) {
      const amountNaira = Math.floor(data.amount / 100);
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
