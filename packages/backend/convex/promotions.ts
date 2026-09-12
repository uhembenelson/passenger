import { v, ConvexError } from "convex/values";
import { PERMISSIONS } from "@passenger/core";
import { mutation, query } from "./_generated/server";
import { requirePermission, requireUser } from "./lib";
import { promotionFields } from "./schema";

function validate(args: { title: string; body: string; backgroundColor: string; textColor: string; imageUrl: string; imageOnly: boolean; destination: string; externalUrl: string; position: number }) {
  if (!args.title.trim() || args.title.length > 100 || args.body.length > 250) throw new ConvexError("Use a title up to 100 characters and copy up to 250 characters.");
  if (![args.backgroundColor, args.textColor].every(color => /^#[0-9a-f]{6}$/i.test(color))) throw new ConvexError("Choose valid six-digit hex colours.");
  const https = (value: string) => { try { const url = new URL(value); return url.protocol === "https:" && !url.username && !url.password; } catch { return false; } };
  if (args.imageUrl && !https(args.imageUrl)) throw new ConvexError("Image URL must use HTTPS.");
  if (args.imageOnly && !args.imageUrl) throw new ConvexError("Add an image for an image-only card.");
  if (args.destination === "external" && !https(args.externalUrl)) throw new ConvexError("Destination URL must use HTTPS.");
  if (!Number.isSafeInteger(args.position) || args.position < 0) throw new ConvexError("Display order must be a non-negative whole number.");
}

export const listPublished = query({
  args: {},
  handler: async ctx => {
    await requireUser(ctx);
    return ctx.db.query("promotions").withIndex("by_published_and_position", q => q.eq("published", true)).collect();
  },
});
export const list = query({
  args: {},
  handler: async ctx => {
    await requirePermission(ctx, await requireUser(ctx), PERMISSIONS.SETTINGS_MANAGE);
    return (await ctx.db.query("promotions").collect()).sort((a, b) => a.position - b.position || a._creationTime - b._creationTime);
  },
});
export const create = mutation({
  args: promotionFields,
  handler: async (ctx, args) => {
    await requirePermission(ctx, await requireUser(ctx), PERMISSIONS.SETTINGS_MANAGE);
    validate(args);
    return ctx.db.insert("promotions", { ...args, title: args.title.trim() });
  },
});
export const update = mutation({
  args: { id: v.id("promotions"), ...promotionFields },
  handler: async (ctx, { id, ...args }) => {
    await requirePermission(ctx, await requireUser(ctx), PERMISSIONS.SETTINGS_MANAGE);
    validate(args);
    await ctx.db.patch(id, { ...args, title: args.title.trim() });
  },
});
export const remove = mutation({
  args: { id: v.id("promotions") },
  handler: async (ctx, { id }) => {
    await requirePermission(ctx, await requireUser(ctx), PERMISSIONS.SETTINGS_MANAGE);
    await ctx.db.delete(id);
  },
});
