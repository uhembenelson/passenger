import { v } from "convex/values";
import { PERMISSIONS } from "@passenger/core";
import { query, mutation } from "./_generated/server";
import { requireUser, requirePermission, audit, fail } from "./lib";
import { MOBILE_PRODUCT_CONFIG_KEY } from "./productConfig";

const mobileConfigValidator = v.object({
  parcelTypes: v.array(v.object({ label: v.string(), weightKg: v.number(), category: v.string() })),
  wallet: v.object({ topUpPresetsNaira: v.array(v.number()), withdrawalPresetsNaira: v.array(v.number()), minTopUpNaira: v.number(), maxTopUpNaira: v.number(), defaultTopUpNaira: v.number() }),
  banks: v.array(v.object({ code: v.string(), name: v.string() })),
  residence: v.object({ states: v.array(v.string()), localGovernmentAreas: v.array(v.string()), defaultState: v.string(), defaultLocalGovernmentArea: v.string() }),
});

export const updateMobileProductConfig = mutation({
  args: { config: mobileConfigValidator },
  handler: async (ctx, { config }) => {
    const user = await requireUser(ctx);
    await requirePermission(ctx, user, PERMISSIONS.SETTINGS_MANAGE);
    if (!config.parcelTypes.length || config.parcelTypes.some(item => !item.label.trim() || !item.category.trim() || item.weightKg <= 0 || item.weightKg > 25)) fail("Add at least one valid parcel type with a weight up to 25 kg.");
    if (!config.banks.length || config.banks.some(bank => !bank.code.trim() || !bank.name.trim())) fail("Add at least one bank with a code and name.");
    if (!config.residence.states.length || !config.residence.localGovernmentAreas.length) fail("Add at least one state and local government area.");
    if (!config.residence.states.includes(config.residence.defaultState) || !config.residence.localGovernmentAreas.includes(config.residence.defaultLocalGovernmentArea)) fail("Residence defaults must be included in their lists.");
    const { wallet } = config;
    if (!Number.isSafeInteger(wallet.minTopUpNaira) || !Number.isSafeInteger(wallet.maxTopUpNaira) || wallet.minTopUpNaira < 100 || wallet.maxTopUpNaira > 500000 || wallet.minTopUpNaira > wallet.maxTopUpNaira) fail("Top-up limits must be whole amounts between ₦100 and ₦500,000.");
    if (wallet.defaultTopUpNaira < wallet.minTopUpNaira || wallet.defaultTopUpNaira > wallet.maxTopUpNaira) fail("The default top-up must be within the configured limits.");
    const body = JSON.stringify(config);
    const existing = await ctx.db.query("settings").withIndex("by_key", q => q.eq("key", MOBILE_PRODUCT_CONFIG_KEY)).first();
    const now = Date.now();
    if (existing) await ctx.db.patch(existing._id, { title: "Mobile product configuration", body, updatedAt: now });
    else await ctx.db.insert("settings", { key: MOBILE_PRODUCT_CONFIG_KEY, title: "Mobile product configuration", body, createdAt: now, updatedAt: now });
    await audit(ctx, user, "settings.mobile_product_updated", "Updated mobile parcel, wallet, bank, and residence options.");
  },
});

export const list = query({
  args: {},
  handler: async (ctx) => {
    return (await ctx.db.query("settings").collect()).map((s) => ({
      id: s._id,
      key: s.key,
      title: s.title,
      body: s.body,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
    }));
  },
});

export const getByKey = query({
  args: { key: v.string() },
  handler: async (ctx, args) => {
    const results = await ctx.db
      .query("settings")
      .withIndex("by_key", (q) => q.eq("key", args.key))
      .collect();
    const s = results[0];
    if (!s) return null;
    return {
      id: s._id,
      key: s.key,
      title: s.title,
      body: s.body,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
    };
  },
});

export const create = mutation({
  args: { key: v.string(), title: v.string(), body: v.string() },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    await requirePermission(ctx, user, PERMISSIONS.SETTINGS_MANAGE);
    const existing = await ctx.db
      .query("settings")
      .withIndex("by_key", (q) => q.eq("key", args.key))
      .collect();
    if (existing.length) fail(`A setting with key "${args.key}" already exists.`);
    if (!args.key.trim()) fail("Setting key is required.");
    if (!args.title.trim()) fail("Title is required.");
    if (!args.body.trim()) fail("Body content is required.");
    const now = Date.now();
    const id = await ctx.db.insert("settings", {
      key: args.key.trim().toLowerCase().replace(/\s+/g, "_"),
      title: args.title.trim(),
      body: args.body.trim(),
      createdAt: now,
      updatedAt: now,
    });
    await audit(ctx, user, "settings.created", `Created setting: ${args.title}`);
    return id;
  },
});

export const update = mutation({
  args: { id: v.id("settings"), title: v.string(), body: v.string() },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    await requirePermission(ctx, user, PERMISSIONS.SETTINGS_MANAGE);
    const existing = await ctx.db.get(args.id);
    if (!existing) fail("Setting not found.");
    if (!args.title.trim()) fail("Title is required.");
    if (!args.body.trim()) fail("Body content is required.");
    await ctx.db.patch(args.id, {
      title: args.title.trim(),
      body: args.body.trim(),
      updatedAt: Date.now(),
    });
    await audit(ctx, user, "settings.updated", `Updated setting: ${args.title}`);
  },
});

export const remove = mutation({
  args: { id: v.id("settings") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    await requirePermission(ctx, user, PERMISSIONS.SETTINGS_MANAGE);
    const existing = await ctx.db.get(args.id);
    if (!existing) fail("Setting not found.");
    await ctx.db.delete(args.id);
    await audit(ctx, user, "settings.deleted", `Deleted setting: ${existing.title}`);
  },
});

export const getFeeConfig = query({
  args: {},
  handler: async (ctx) => {
    const all = await ctx.db.query("feeConfig").collect();
    const config = all[0];
    if (!config) {
      return {
        platformFeePercent: 10,
        baseFeeNaira: 1400,
        distanceRateNairaPerKm: 17,
        minFeeNaira: 2000,
        updatedAt: 0,
      };
    }
    return {
      platformFeePercent: config.platformFeePercent,
      baseFeeNaira: config.baseFeeNaira,
      distanceRateNairaPerKm: config.distanceRateNairaPerKm,
      minFeeNaira: config.minFeeNaira ?? 2000,
      categoryMultipliers: config.categoryMultipliers as Record<string, number> | undefined,
      weightMultipliers: config.weightMultipliers as { minKg: number; maxKg: number; multiplier: number }[] | undefined,
      updatedAt: config.updatedAt,
    };
  },
});

export const updateFeeConfig = mutation({
  args: {
    platformFeePercent: v.number(),
    baseFeeNaira: v.number(),
    distanceRateNairaPerKm: v.number(),
    minFeeNaira: v.number(),
    categoryMultipliers: v.optional(v.any()),
    weightMultipliers: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    await requirePermission(ctx, user, PERMISSIONS.SETTINGS_MANAGE);
    if (args.platformFeePercent < 0 || args.platformFeePercent > 50)
      fail("Platform fee must be between 0 and 50%.");
    if (args.baseFeeNaira < 0 || args.baseFeeNaira > 100000)
      fail("Base fee must be between 0 and 100,000.");
    if (args.distanceRateNairaPerKm < 0 || args.distanceRateNairaPerKm > 1000)
      fail("Distance rate must be between 0 and 1,000.");
    if (args.minFeeNaira < 0 || args.minFeeNaira > 100000)
      fail("Minimum fee must be between 0 and 100,000.");
    const all = await ctx.db.query("feeConfig").collect();
    const existing = all[0];
    const data = {
      platformFeePercent: args.platformFeePercent,
      baseFeeNaira: args.baseFeeNaira,
      distanceRateNairaPerKm: args.distanceRateNairaPerKm,
      minFeeNaira: args.minFeeNaira,
      categoryMultipliers: args.categoryMultipliers ?? {},
      weightMultipliers: args.weightMultipliers ?? [],
      updatedAt: Date.now(),
      updatedBy: user._id,
    };
    if (existing) {
      await ctx.db.patch(existing._id, data);
    } else {
      await ctx.db.insert("feeConfig", data);
    }
    await audit(
      ctx,
      user,
      "settings.fee_updated",
      `Fee config updated: ${args.platformFeePercent}% platform, ₦${args.baseFeeNaira} base, ₦${args.distanceRateNairaPerKm}/km, ₦${args.minFeeNaira} min`,
    );
  },
});
