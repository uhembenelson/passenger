import { beforeEach, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "../convex/schema";
import { api } from "../convex/_generated/api";
const modules = import.meta.glob("../convex/**/*.ts");
const identity = (subject: string) => ({ subject, issuer: "https://clerk.test", tokenIdentifier: `https://clerk.test|${subject}` });
const card = { title: "Send with Passenger", body: "Find a traveller for your parcel.", backgroundColor: "#DCEBCB", textColor: "#183B2B", imageUrl: "", imageOnly: false, destination: "send" as const, externalUrl: "", position: 0, published: false };
beforeEach(() => vi.stubEnv("ADMIN_CLERK_SUBJECTS", "admin"));
async function setup() {
  const t = convexTest(schema, modules);
  const admin = t.withIdentity(identity("admin"));
  const user = t.withIdentity(identity("sender"));
  await admin.mutation(api.accounts.ensureProfile, { name: "Admin", phone: "+2348000000001" });
  await user.mutation(api.accounts.ensureProfile, { name: "Sender", phone: "+2348000000002" });
  return { t, admin, user };
}
it("supports draft, publication, ordering, editing and deletion", async () => {
  const { admin, user } = await setup();
  const id = await admin.mutation(api.promotions.create, card);
  expect(await user.query(api.promotions.listPublished)).toEqual([]);
  await admin.mutation(api.promotions.create, { ...card, title: "Later", position: 4, published: true });
  await admin.mutation(api.promotions.update, { ...card, id, title: "First", published: true });
  expect((await user.query(api.promotions.listPublished)).map(p => p.title)).toEqual(["First", "Later"]);
  await admin.mutation(api.promotions.update, { ...card, id });
  expect((await user.query(api.promotions.listPublished)).map(p => p.title)).toEqual(["Later"]);
  await admin.mutation(api.promotions.remove, { id });
  expect(await admin.query(api.promotions.list)).toHaveLength(1);
});
it("rejects non-admin access and unauthenticated reads", async () => {
  const { t, admin, user } = await setup();
  const id = await admin.mutation(api.promotions.create, card);
  await expect(user.mutation(api.promotions.create, card)).rejects.toThrow();
  await expect(user.mutation(api.promotions.update, { ...card, id })).rejects.toThrow();
  await expect(user.mutation(api.promotions.remove, { id })).rejects.toThrow();
  await expect(user.query(api.promotions.list)).rejects.toThrow();
  await expect(t.query(api.promotions.listPublished)).rejects.toThrow();
});
it("validates image-only cards, URLs, colours and ordering", async () => {
  const { admin } = await setup();
  for (const invalid of [{ title: " " }, { imageOnly: true }, { backgroundColor: "red" }, { position: -1 }, { position: 0.5 }, { imageUrl: "javascript:alert(1)" }, { destination: "external" as const, externalUrl: "javascript:alert(1)" }]) {
    await expect(admin.mutation(api.promotions.create, { ...card, ...invalid })).rejects.toThrow();
  }
  await admin.mutation(api.promotions.create, { ...card, imageOnly: true, imageUrl: "https://example.com/promo.jpg", destination: "external", externalUrl: "https://example.com/offer" });
  expect(await admin.query(api.promotions.list)).toHaveLength(1);
});
