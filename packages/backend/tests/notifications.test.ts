import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import schema from "../convex/schema";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";

const modules = import.meta.glob("../convex/**/*.ts");
async function fixture() {
  const t = convexTest(schema, modules);
  const member = (subject: string) => t.withIdentity({ subject, issuer: "https://clerk.test", tokenIdentifier: `https://clerk.test|${subject}` });
  const sender = member("sender"), traveller = member("traveller"), outsider = member("outsider");
  const ids = [] as Id<"users">[];
  for (const [client, name] of [[sender, "Sender"], [traveller, "Traveller"], [outsider, "Outsider"]] as const) {
    const profile = await client.mutation(api.accounts.ensureProfile, { name, phone: `+234800000000${ids.length}` });
    ids.push(profile.id as Id<"users">);
  }
  const [senderId, travellerId, outsiderId] = ids;
  const shipmentId = await t.run(ctx => ctx.db.insert("shipments", {
    senderId, travellerId, reference: "P-TEST", origin: "Jos", destination: "Abuja",
    description: "Sealed parcel", category: "Clothing", weightKg: 1, valueNaira: 1000, feeNaira: 100,
    receiverName: "Receiver", receiverPhone: "+2348000000010", status: "delivered", paymentStatus: "released",
    approved: true, reservationActive: false, createdAt: Date.now(), updatedAt: Date.now(),
  }));
  return { t, sender, traveller, outsider, senderId, travellerId, outsiderId, shipmentId };
}
const page = { numItems: 2, cursor: null };

describe("in-app notifications", () => {
  it("paginates only the recipient's updates and persists read state", async () => {
    const f = await fixture();
    const ids = await f.t.run(async ctx => {
      const result = [];
      for (let i = 0; i < 5; i++) result.push(await ctx.db.insert("notifications", { userId: f.senderId, title: `Update ${i}`, body: "Delivery update", createdAt: Date.now() + i }));
      await ctx.db.insert("notifications", { userId: f.outsiderId, title: "Private", body: "Private", createdAt: Date.now() });
      return result;
    });
    const first = await f.sender.query(api.notifications.listPage, { paginationOpts: page });
    expect(first.page.map(n => n.id)).toEqual([ids[4], ids[3]]);
    const next = await f.sender.query(api.notifications.listPage, { paginationOpts: { ...page, cursor: first.continueCursor } });
    expect(next.page.map(n => n.id)).toEqual([ids[2], ids[1]]);
    await expect(f.outsider.mutation(api.notifications.markRead, { notificationId: ids[4] })).rejects.toThrow("Notification not found");
    await f.sender.mutation(api.notifications.markRead, { notificationId: ids[4] });
    const readAt = await f.t.run(async ctx => (await ctx.db.get(ids[4]))?.readAt);
    await f.sender.mutation(api.notifications.markRead, { notificationId: ids[4] });
    expect(await f.t.run(async ctx => (await ctx.db.get(ids[4]))?.readAt)).toBe(readAt);
    expect(await f.sender.query(api.notifications.unreadCount, {})).toBe(4);
    expect((await f.sender.query(api.notifications.listPage, { unreadOnly: true, paginationOpts: page })).page.map(n => n.id)).toEqual([ids[3], ids[2]]);
    await f.sender.mutation(api.notifications.markRead, {});
    expect(await f.sender.query(api.notifications.unreadCount, {})).toBe(0);
    expect(await f.outsider.query(api.notifications.unreadCount, {})).toBe(1);
    expect((await f.sender.query(api.notifications.listPage, { unreadOnly: true, paginationOpts: page })).page).toEqual([]);
    await expect(f.t.query(api.notifications.listPage, { paginationOpts: page })).rejects.toThrow("Sign in");
    await expect(f.t.mutation(api.notifications.markRead, {})).rejects.toThrow("Sign in");
  });

  it("notifies the other participant about messages and reviews without exposing message content", async () => {
    const f = await fixture();
    await f.sender.mutation(api.conversations.send, { shipmentId: f.shipmentId, body: "Private meeting details" });
    const updates = await f.traveller.query(api.notifications.listPage, { paginationOpts: page });
    expect(updates.page).toHaveLength(1);
    expect(updates.page[0]).toMatchObject({ title: "New delivery message", shipmentId: f.shipmentId });
    expect(updates.page[0].body).not.toContain("Private meeting details");
    expect(await f.sender.query(api.notifications.unreadCount, {})).toBe(0);
    expect(await f.outsider.query(api.notifications.unreadCount, {})).toBe(0);
    await f.sender.mutation(api.reviews.create, { shipmentId: f.shipmentId, rating: 5 });
    expect(await f.traveller.query(api.notifications.unreadCount, {})).toBe(2);
    await expect(f.sender.mutation(api.reviews.create, { shipmentId: f.shipmentId, rating: 5 })).rejects.toThrow("already reviewed");
    expect(await f.traveller.query(api.notifications.unreadCount, {})).toBe(2);
  });

  it("resolves delivery links for participants and denies unrelated users", async () => {
    const f = await fixture();
    expect((await f.sender.query(api.notifications.delivery, { shipmentId: f.shipmentId }))?.id).toBe(f.shipmentId);
    expect(await f.outsider.query(api.notifications.delivery, { shipmentId: f.shipmentId })).toBeNull();
    await f.t.run(ctx => ctx.db.delete(f.shipmentId));
    expect(await f.sender.query(api.notifications.delivery, { shipmentId: f.shipmentId })).toBeNull();
  });
});
