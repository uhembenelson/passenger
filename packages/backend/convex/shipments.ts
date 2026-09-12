import { v } from "convex/values";
import { calculateDeliveryFee } from "@passenger/core";
import type { CreateShipmentInput } from "@passenger/core";
import { mutation } from "./_generated/server";
import { audit, fail, getFeeConfig, getTierLimits, requireSender, requireUser, requireVerified, safeNormalizePhone, safeValidateShipment, shipment } from "./lib";
import { validateEvidence } from "./evidence";
import { deductForShipment, refundForShipment } from "./wallet";

export const update = mutation({
  args: {
    shipmentId: v.id("shipments"),
    origin: v.string(),
    destination: v.string(),
    description: v.string(),
    category: v.string(),
    weightKg: v.number(),
    valueNaira: v.number(),
    receiverName: v.string(),
    receiverPhone: v.string(),
    pickupInstructions: v.string(),
    dropoffInstructions: v.string(),
    readyAt: v.number(),
    preferredPickupAt: v.optional(v.number()),
    pickupFlexBeforeMinutes: v.optional(v.number()),
    pickupFlexAfterMinutes: v.optional(v.number()),
    deliveryDeadline: v.number(),
    evidenceIds: v.array(v.id("evidence")),
    safetyConsent: v.boolean(),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    requireVerified(user);
    const existing = await shipment(ctx, args.shipmentId);
    requireSender(existing, user);
    if (!["pending_review", "rejected", "open"].includes(existing.status)) {
      fail("Only parcels awaiting review, requiring changes, or still open may be edited.");
    }

    safeValidateShipment(args satisfies CreateShipmentInput);
    const limits = await getTierLimits(ctx, user);
    if (args.valueNaira > limits.maxShipmentValueNaira) {
      fail(`Your ${limits.tier} permits declaring parcel value up to ₦${limits.maxShipmentValueNaira.toLocaleString()}. Request a tier upgrade to send higher-value items.`);
    }
    await validateEvidence(ctx, args.evidenceIds, user._id, "parcel");

    const feeConfig = await getFeeConfig(ctx);
    const feeNaira = calculateDeliveryFee(args, feeConfig);

    if (existing.paymentStatus === "held") {
      if (feeNaira > existing.feeNaira) {
        await deductForShipment(ctx, user, existing._id, feeNaira - existing.feeNaira);
      } else if (feeNaira < existing.feeNaira) {
        await refundForShipment(ctx, user, existing._id, existing.feeNaira - feeNaira, "Parcel fee recalculated after edit");
      }
    }

    const nextStatus = "pending_review" as const;
    await ctx.db.patch(existing._id, {
      origin: args.origin.trim(),
      destination: args.destination.trim(),
      description: args.description.trim(),
      category: args.category,
      weightKg: args.weightKg,
      valueNaira: args.valueNaira,
      feeNaira,
      receiverName: args.receiverName.trim(),
      receiverPhone: safeNormalizePhone(args.receiverPhone),
      pickupInstructions: args.pickupInstructions.trim(),
      dropoffInstructions: args.dropoffInstructions.trim(),
      readyAt: args.readyAt,
      preferredPickupAt: args.preferredPickupAt,
      pickupFlexBeforeMinutes: args.pickupFlexBeforeMinutes,
      pickupFlexAfterMinutes: args.pickupFlexAfterMinutes,
      deliveryDeadline: args.deliveryDeadline,
      evidenceIds: args.evidenceIds,
      safetyConsent: args.safetyConsent,
      status: nextStatus,
      approved: false,
      reviewNote: undefined,
      updatedAt: Date.now(),
    });
    await audit(ctx, user, "shipment.updated", "Parcel declaration updated and resubmitted for review.", existing._id);
  },
});
