import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { requireUser, isAdmin, audit } from "./lib";

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
    isAdmin(user);
    const existing = await ctx.db
      .query("settings")
      .withIndex("by_key", (q) => q.eq("key", args.key))
      .collect();
    if (existing.length) throw new Error(`A setting with key "${args.key}" already exists.`);
    if (!args.key.trim()) throw new Error("Setting key is required.");
    if (!args.title.trim()) throw new Error("Title is required.");
    if (!args.body.trim()) throw new Error("Body content is required.");
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
    isAdmin(user);
    const existing = await ctx.db.get(args.id);
    if (!existing) throw new Error("Setting not found.");
    if (!args.title.trim()) throw new Error("Title is required.");
    if (!args.body.trim()) throw new Error("Body content is required.");
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
    isAdmin(user);
    const existing = await ctx.db.get(args.id);
    if (!existing) throw new Error("Setting not found.");
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
    isAdmin(user);
    if (args.platformFeePercent < 0 || args.platformFeePercent > 50)
      throw new Error("Platform fee must be between 0 and 50%.");
    if (args.baseFeeNaira < 0 || args.baseFeeNaira > 100000)
      throw new Error("Base fee must be between 0 and 100,000.");
    if (args.distanceRateNairaPerKm < 0 || args.distanceRateNairaPerKm > 1000)
      throw new Error("Distance rate must be between 0 and 1,000.");
    if (args.minFeeNaira < 0 || args.minFeeNaira > 100000)
      throw new Error("Minimum fee must be between 0 and 100,000.");
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
