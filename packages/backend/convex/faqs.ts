import { v } from "convex/values";
import { PERMISSIONS } from "@passenger/core";
import { query, mutation } from "./_generated/server";
import { requireUser, requirePermission } from "./lib";

export const list = query({
  args: {},
  handler: async (ctx) => {
    await requireUser(ctx);
    const faqs = await ctx.db.query("faqs").withIndex("by_created").order("desc").collect();
    return faqs.map(f => ({ id: f._id, question: f.question, answer: f.answer, createdAt: f.createdAt, updatedAt: f.updatedAt }));
  },
});

export const create = mutation({
  args: { question: v.string(), answer: v.string() },
  handler: async (ctx, args) => {
    const viewer = await requireUser(ctx);
    await requirePermission(ctx, viewer, PERMISSIONS.SETTINGS_MANAGE);
    const now = Date.now();
    const id = await ctx.db.insert("faqs", { question: args.question, answer: args.answer, createdAt: now, updatedAt: now });
    return id;
  },
});

export const update = mutation({
  args: { id: v.id("faqs"), question: v.string(), answer: v.string() },
  handler: async (ctx, args) => {
    const viewer = await requireUser(ctx);
    await requirePermission(ctx, viewer, PERMISSIONS.SETTINGS_MANAGE);
    await ctx.db.patch(args.id, { question: args.question, answer: args.answer, updatedAt: Date.now() });
  },
});

export const remove = mutation({
  args: { id: v.id("faqs") },
  handler: async (ctx, args) => {
    const viewer = await requireUser(ctx);
    await requirePermission(ctx, viewer, PERMISSIONS.SETTINGS_MANAGE);
    await ctx.db.delete(args.id);
  },
});
