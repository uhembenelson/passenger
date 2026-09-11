import { v } from "convex/values";
import { PERMISSIONS } from "@passenger/core";
import { query, mutation } from "./_generated/server";
import { requireUser, requirePermission, audit } from "./lib";

export const list = query({
  args: {},
  handler: async (ctx) => {
    return (await ctx.db.query("kycTiers").withIndex("by_created").order("desc").collect()).map((t) => ({
      id: t._id,
      tierName: t.tierName,
      requirements: t.requirements,
      maxShipmentValueNaira: t.maxShipmentValueNaira,
      maxCapacityKg: t.maxCapacityKg,
      description: t.description,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
    }));
  },
});

export const create = mutation({
  args: { tierName: v.string(), requirements: v.array(v.string()), maxShipmentValueNaira: v.number(), maxCapacityKg: v.optional(v.number()), description: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    await requirePermission(ctx, user, PERMISSIONS.SETTINGS_MANAGE);
    if (!args.tierName.trim()) throw new Error("Tier name is required.");
    const requirements = args.requirements.map(value => value.trim()).filter(Boolean);
    if (!requirements.length || requirements.length > 10) throw new Error("Configure between 1 and 10 verification requirements.");
    if (args.maxShipmentValueNaira < 0) throw new Error("Max shipment value cannot be negative.");
    if (args.maxCapacityKg !== undefined && (args.maxCapacityKg < 0 || args.maxCapacityKg > 2000)) throw new Error("Max carry capacity must be between 0 and 2000 kg.");
    const probe = await ctx.db.query("kycTiers").withIndex("by_created").collect();
    if (probe.some((t) => t.tierName.trim().toLowerCase() === args.tierName.trim().toLowerCase())) throw new Error("A tier with that name already exists.");
    const now = Date.now();
    const id = await ctx.db.insert("kycTiers", {
      tierName: args.tierName.trim(),
      requirements,
      maxShipmentValueNaira: args.maxShipmentValueNaira,
      maxCapacityKg: args.maxCapacityKg,
      description: args.description?.trim() || undefined,
      createdAt: now,
      updatedAt: now,
    });
    await audit(ctx, user, "kyc.created", `Created KYC tier: ${args.tierName}`);
    return id;
  },
});

export const update = mutation({
  args: { id: v.id("kycTiers"), tierName: v.string(), requirements: v.array(v.string()), maxShipmentValueNaira: v.number(), maxCapacityKg: v.optional(v.number()), description: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    await requirePermission(ctx, user, PERMISSIONS.SETTINGS_MANAGE);
    const existing = await ctx.db.get(args.id);
    if (!existing) throw new Error("KYC tier not found.");
    if (!args.tierName.trim()) throw new Error("Tier name is required.");
    const requirements = args.requirements.map(value => value.trim()).filter(Boolean);
    if (!requirements.length || requirements.length > 10) throw new Error("Configure between 1 and 10 verification requirements.");
    if (args.maxShipmentValueNaira < 0) throw new Error("Max shipment value cannot be negative.");
    if (args.maxCapacityKg !== undefined && (args.maxCapacityKg < 0 || args.maxCapacityKg > 2000)) throw new Error("Max carry capacity must be between 0 and 2000 kg.");
    const probe = await ctx.db.query("kycTiers").withIndex("by_created").collect();
    if (probe.some((t) => t._id !== args.id && t.tierName.trim().toLowerCase() === args.tierName.trim().toLowerCase())) throw new Error("A tier with that name already exists.");
    await ctx.db.patch(args.id, {
      tierName: args.tierName.trim(),
      requirements,
      maxShipmentValueNaira: args.maxShipmentValueNaira,
      maxCapacityKg: args.maxCapacityKg,
      description: args.description?.trim() || undefined,
      updatedAt: Date.now(),
    });
    await audit(ctx, user, "kyc.updated", `Updated KYC tier: ${args.tierName}`);
  },
});

export const remove = mutation({
  args: { id: v.id("kycTiers") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    await requirePermission(ctx, user, PERMISSIONS.SETTINGS_MANAGE);
    const existing = await ctx.db.get(args.id);
    if (!existing) throw new Error("KYC tier not found.");
    await ctx.db.delete(args.id);
    await audit(ctx, user, "kyc.deleted", `Deleted KYC tier: ${existing.tierName}`);
  },
});