import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { audit, fail, isAdmin, note, participant, requireUser, shipment } from "./lib";

export const list = query({
  args: { shipmentId: v.id("shipments") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx); const parcel = await shipment(ctx, args.shipmentId);
    if (!participant(parcel, user) && !isAdmin(user)) fail("Shipment participant access required.");
    const messages = await ctx.db.query("messages").withIndex("by_shipment", q => q.eq("shipmentId", parcel._id)).collect();
    return Promise.all(messages.sort((a,b)=>a.createdAt-b.createdAt).map(async message => ({ id: message._id, shipmentId: message.shipmentId, authorId: message.authorId, authorName: (await ctx.db.get(message.authorId))?.name ?? "Member", body: message.body, createdAt: message.createdAt })));
  },
});

export const send = mutation({
  args: { shipmentId: v.id("shipments"), body: v.string() },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx); const parcel = await shipment(ctx, args.shipmentId);
    if (!participant(parcel, user)) fail("Shipment participant access required.");
    const body = note(args.body, "Message", 1, 2000);
    const id = await ctx.db.insert("messages", { shipmentId: parcel._id, authorId: user._id, body, createdAt: Date.now() });
    await audit(ctx, user, "message.sent", "Participant coordination message sent.", parcel._id);
    return id;
  },
});
