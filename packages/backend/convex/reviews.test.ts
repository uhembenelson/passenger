/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { expect, test } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { personDto } from "./lib";

const modules = import.meta.glob("./**/*.ts");
async function fixture() {
  const t = convexTest(schema, modules);
  const clients = ["sender", "traveller", "other"].map(subject => t.withIdentity({ subject, issuer: "https://clerk.test", tokenIdentifier: `https://clerk.test|${subject}` }));
  const users = await Promise.all(clients.map((client, i) => client.mutation(api.accounts.ensureProfile, { name: ["Sender", "Traveller", "Other"][i]!, phone: `+234800000000${i}` })));
  const senderId = users[0]!.id as Id<"users">;
  const travellerId = users[1]!.id as Id<"users">;
  const shipmentId = await t.run(ctx => ctx.db.insert("shipments", {
    reference: "RATING-TEST", senderId, travellerId, origin: "Jos", destination: "Abuja",
    description: "Books", category: "Books", weightKg: 1, valueNaira: 1000, feeNaira: 500,
    receiverName: "Receiver", receiverPhone: "+2348000000010", status: "delivered", paymentStatus: "held",
    createdAt: Date.now(), updatedAt: Date.now(), approved: true, reservationActive: false,
  }));
  return { t, sender: clients[0]!, traveller: clients[1]!, other: clients[2]!, senderId, travellerId, shipmentId };
}

test("stores a star-only rating and includes it in the traveller profile", async () => {
  const f = await fixture();
  const id = await f.sender.mutation(api.reviews.create, { shipmentId: f.shipmentId, rating: 4 });
  expect(await f.sender.query(api.reviews.list, {})).toEqual([expect.objectContaining({ id, rating: 4, comment: "", authorId: f.senderId, targetId: f.travellerId })]);
  expect(await f.traveller.query(api.reviews.list, {})).toHaveLength(1);
  expect(await f.other.query(api.reviews.list, {})).toEqual([]);
  const profile = await f.t.run(async ctx => personDto(ctx, (await ctx.db.get(f.travellerId))!));
  expect(profile).toMatchObject({ rating: 4, reviewCount: 1 });
  await expect(f.sender.mutation(api.reviews.create, { shipmentId: f.shipmentId, rating: 5 })).rejects.toThrow("already reviewed");
});

test("requires a participant and a completed delivery", async () => {
  const f = await fixture();
  await expect(f.other.mutation(api.reviews.create, { shipmentId: f.shipmentId, rating: 4 })).rejects.toThrow("completed delivery");
  await f.t.run(ctx => ctx.db.patch(f.shipmentId, { status: "in_transit" }));
  await expect(f.sender.mutation(api.reviews.create, { shipmentId: f.shipmentId, rating: 4 })).rejects.toThrow("completed delivery");
  expect(await f.sender.query(api.reviews.list, {})).toEqual([]);
});

test("validates stars and comment length without requiring written feedback", async () => {
  const f = await fixture();
  for (const rating of [0, 6, 2.5]) {
    await expect(f.sender.mutation(api.reviews.create, { shipmentId: f.shipmentId, rating })).rejects.toThrow("Rating must");
  }
  await expect(f.sender.mutation(api.reviews.create, { shipmentId: f.shipmentId, rating: 3, comment: "a".repeat(1001) })).rejects.toThrow("Review must");
  await f.sender.mutation(api.reviews.create, { shipmentId: f.shipmentId, rating: 3, comment: "  OK  " });
  expect(await f.sender.query(api.reviews.list, {})).toEqual([expect.objectContaining({ comment: "OK" })]);
});
