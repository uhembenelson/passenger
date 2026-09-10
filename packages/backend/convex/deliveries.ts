import { v } from "convex/values";
import { action, mutation } from "./_generated/server";
import type { ActionCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { codeKind } from "./schema";
import { audit, fail, noOpenDispute, notify, requireActive, requireTraveller, requireUser, shipment, subject } from "./lib";
import { disputeDefinition } from "./deliveryState";

export const issueCode = action({
  args: { shipmentId: v.id("shipments"), kind: codeKind },
  handler: async (ctx, args): Promise<{ code?: string }> => {
    const sub = await subject(ctx);
    const generated: { code: string; hash: string } = await ctx.runAction(internal.deliveryCrypto.generate, args);
    await ctx.runMutation(internal.deliveryState.storeCode, { ...args, subject: sub, hash: generated.hash });

    if (args.kind === "delivery") {
      try {
        const recipient = await ctx.runQuery(internal.deliveryState.deliveryRecipient, { subject: sub, shipmentId: args.shipmentId });
        const sms = await ctx.runAction(internal.sms.sendDeliveryCode, {
          receiverPhone: recipient.receiverPhone,
          code: generated.code,
          shipmentReference: recipient.reference,
        });
        await ctx.runMutation(internal.deliveryState.markSms, {
          shipmentId: args.shipmentId,
          kind: "delivery",
          status: "sent",
          smsId: sms.sid,
        });
      } catch (error) {
        await ctx.runMutation(internal.deliveryState.markSms, {
          shipmentId: args.shipmentId,
          kind: "delivery",
          status: "failed",
        });
        throw error;
      }
      return {};
    }

    return { code: generated.code };
  },
});

async function confirm(ctx: ActionCtx, args: { shipmentId: Id<"shipments">; code: string }, kind: "handover" | "delivery"): Promise<void> {
  const sub = await subject(ctx);
  if (args.code.length > 64) fail("Invalid code.");
  const hash: string = await ctx.runAction(internal.deliveryCrypto.hash, { ...args, kind });
  const result: { ok: boolean; error?: string } = await ctx.runMutation(internal.deliveryState.consumeCode, {
    shipmentId: args.shipmentId,
    kind,
    hash,
    subject: sub,
  });
  if (!result.ok) fail(result.error ?? "Invalid proof.");
}

export const prepareDeliveryShare = action({
  args: { shipmentId: v.id("shipments") },
  handler: async (ctx, args): Promise<{ code: string; receiverPhone: string; reference: string }> => {
    const sub = await subject(ctx);
    const generated: { code: string; hash: string } = await ctx.runAction(internal.deliveryCrypto.generate, { ...args, kind: "delivery" });
    await ctx.runMutation(internal.deliveryState.storeCode, { ...args, subject: sub, kind: "delivery", hash: generated.hash });
    const recipient = await ctx.runQuery(internal.deliveryState.deliveryRecipient, { subject: sub, shipmentId: args.shipmentId });
    return { code: generated.code, receiverPhone: recipient.receiverPhone, reference: recipient.reference };
  },
});

export const confirmHandover = action({
  args: { shipmentId: v.id("shipments"), code: v.string() },
  handler: async (ctx, args): Promise<void> => confirm(ctx, args, "handover"),
});

export const confirmDelivery = action({
  args: { shipmentId: v.id("shipments"), code: v.string() },
  handler: async (ctx, args): Promise<void> => confirm(ctx, args, "delivery"),
});

export const updateLocation = mutation({
  args: { shipmentId: v.id("shipments"), latitude: v.number(), longitude: v.number(), place: v.string() },
  handler: async (ctx, args): Promise<void> => {
    const user = await requireUser(ctx);
    const record = await shipment(ctx, args.shipmentId);
    requireTraveller(record, user);
    requireActive(user);
    await noOpenDispute(ctx, record._id);
    if (record.status !== "in_transit") fail("Location can only be updated while the parcel is in transit.");
    if (!Number.isFinite(args.latitude) || args.latitude < -90 || args.latitude > 90 || !Number.isFinite(args.longitude) || args.longitude < -180 || args.longitude > 180) fail("The device returned invalid coordinates.");
    const place = args.place.trim();
    if (!place || place.length > 200) fail("The current place could not be identified.");
    const now = Date.now();
    if (record.latestLocationAt && now - record.latestLocationAt < 30_000) fail("Wait 30 seconds before sharing another location update.");
    const completed = Math.max(0, record.locationCheckInCount ?? (record.latestLocationAt ? 1 : 0));
    await ctx.db.patch(record._id, { latestLatitude: args.latitude, latestLongitude: args.longitude, latestLocationLabel: place, latestLocationAt: now, locationCheckInCount: completed + 1, updatedAt: now });
    await notify(ctx, record.senderId, "Parcel location updated", `${record.travellerId === record.senderId ? "Your" : "The traveller's"} latest check-in is ${place}.`, record._id);
    await audit(ctx, user, "shipment.location_updated", `Traveller shared a foreground location check-in near ${place}.`, record._id);
  },
});

export const raiseDispute = mutation(disputeDefinition);
