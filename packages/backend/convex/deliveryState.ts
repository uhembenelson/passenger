import { v } from "convex/values";
import { internalMutation, internalQuery, mutation } from "./_generated/server";
import { codeKind } from "./schema";
import {
  audit,
  fail,
  noOpenDispute,
  note,
  requireParticipant,
  requireSender,
  requireTraveller,
  requireUser,
  requireVerified,
  shipment,
  transition,
  userBySubject,
} from "./lib";

export const storeCode = internalMutation({
  args: { subject: v.string(), shipmentId: v.id("shipments"), kind: codeKind, hash: v.string() },
  handler: async (ctx, args): Promise<void> => {
    const user = await userBySubject(ctx, args.subject);
    const s = await shipment(ctx, args.shipmentId);
    requireSender(s, user);
    requireVerified(user);
    await noOpenDispute(ctx, s._id);

    if (s.paymentStatus !== "held" || s.status !== (args.kind === "handover" ? "funded" : "in_transit")) fail("A code cannot be issued at this delivery stage.");

    const old = await ctx.db.query("codes").withIndex("by_shipment_kind", q => q.eq("shipmentId", s._id).eq("kind", args.kind)).unique();
    const now = Date.now();
    const sameWindow = old && now - old.windowStart < 3_600_000;

    if (old?.consumedAt !== undefined) fail("This proof has already been used.");
    if (old && now - old.issuedAt < 60_000) fail("Wait at least one minute before requesting another code.");
    if (sameWindow && old.issueCount >= 3) fail("Maximum three codes per hour. Try again later.");

    const value = {
      shipmentId: s._id,
      kind: args.kind,
      hash: args.hash,
      issuedAt: now,
      expiresAt: now + 600_000,
      attempts: 0,
      issueCount: sameWindow ? old.issueCount + 1 : 1,
      windowStart: sameWindow ? old.windowStart : now,
      ...(args.kind === "delivery" ? { smsStatus: "pending" as const } : {}),
    };

    if (old) await ctx.db.replace(old._id, value);
    else await ctx.db.insert("codes", value);

    await audit(
      ctx,
      user,
      `proof.${args.kind}.issued`,
      args.kind === "handover"
        ? "One-time handover proof issued; expires in ten minutes. No code retained in logs."
        : "One-time delivery proof issued for receiver SMS delivery; expires in ten minutes. No code retained in logs.",
      s._id,
    );
  },
});

export const deliveryRecipient = internalQuery({
  args: { subject: v.string(), shipmentId: v.id("shipments") },
  handler: async (ctx, args) => {
    const user = await userBySubject(ctx, args.subject);
    const s = await shipment(ctx, args.shipmentId);
    requireSender(s, user);
    requireVerified(user);
    if (s.paymentStatus !== "held" || s.status !== "in_transit") fail("Receiver code SMS is not available at this delivery stage.");
    return { receiverPhone: s.receiverPhone, reference: s.reference };
  },
});

export const markSms = internalMutation({
  args: {
    shipmentId: v.id("shipments"),
    kind: codeKind,
    status: v.union(v.literal("pending"), v.literal("sent"), v.literal("failed")),
    smsId: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<void> => {
    const proof = await ctx.db.query("codes").withIndex("by_shipment_kind", q => q.eq("shipmentId", args.shipmentId).eq("kind", args.kind)).unique();
    if (!proof) return;
    await ctx.db.patch(proof._id, { smsStatus: args.status, smsId: args.smsId });
  },
});

export const consumeCode = internalMutation({
  args: { subject: v.string(), shipmentId: v.id("shipments"), kind: codeKind, hash: v.string() },
  handler: async (ctx, args): Promise<{ ok: boolean; error?: string }> => {
    const user = await userBySubject(ctx, args.subject);
    const s = await shipment(ctx, args.shipmentId);
    requireTraveller(s, user);
    requireVerified(user);
    await noOpenDispute(ctx, s._id);

    if (s.paymentStatus !== "held" || s.status !== (args.kind === "handover" ? "funded" : "in_transit")) fail("Proof is not valid at this delivery stage.");

    const proof = await ctx.db.query("codes").withIndex("by_shipment_kind", q => q.eq("shipmentId", s._id).eq("kind", args.kind)).unique();
    if (!proof || proof.consumedAt !== undefined || proof.attempts >= 5) fail("Proof is unavailable or locked. Ask the sender for a new code.");

    if (proof.expiresAt <= Date.now() || proof.hash !== args.hash) {
      await ctx.db.patch(proof._id, { attempts: proof.attempts + 1 });
      await audit(ctx, user, `proof.${args.kind}.failed`, "Invalid or expired proof attempt.", s._id);
      return { ok: false, error: "Invalid or expired code. Five attempts maximum." };
    }

    await ctx.db.patch(proof._id, { consumedAt: Date.now() });
    await transition(ctx, s, args.kind === "handover" ? "in_transit" : "delivered");
    await audit(
      ctx,
      user,
      `proof.${args.kind}.confirmed`,
      args.kind === "handover" ? "Sender handover proof confirmed." : "Receiver delivery proof confirmed. Payout requires external reconciliation.",
      s._id,
    );
    return { ok: true };
  },
});

// Re-exported as deliveries.raiseDispute, preserving the public API namespace.
export const disputeDefinition = {
  args: { shipmentId: v.id("shipments"), reason: v.string() },
  handler: async (ctx: import("./_generated/server").MutationCtx, args: { shipmentId: import("./_generated/dataModel").Id<"shipments">; reason: string }) => {
    const user = await requireUser(ctx);
    const s = await shipment(ctx, args.shipmentId);
    requireParticipant(s, user);
    if (s.paymentStatus === "released" || s.paymentStatus === "refunded") fail("Payment already reconciled; contact support for further claims.");

    await noOpenDispute(ctx, s._id);
    const reason = note(args.reason, "Dispute reason", 10);
    await transition(ctx, s, "disputed");
    const id = await ctx.db.insert("disputes", {
      shipmentId: s._id,
      openedBy: user._id,
      reason,
      status: "open",
      previousStatus: s.status,
      createdAt: Date.now(),
    });
    await audit(ctx, user, "dispute.opened", "A participant opened a dispute; payout and proof actions frozen.", s._id);
    return id;
  },
};

export const raiseDispute = mutation(disputeDefinition);
