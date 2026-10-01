/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
const modules = import.meta.glob("./**/*.ts");
async function fixture() {
  const t = convexTest(schema, modules);
  const traveller = t.withIdentity({ subject: "traveller", issuer: "https://clerk.test", tokenIdentifier: "https://clerk.test|traveller" });
  const sender = t.withIdentity({ subject: "sender", issuer: "https://clerk.test", tokenIdentifier: "https://clerk.test|sender" });
  const travellerId = (await traveller.mutation(api.accounts.ensureProfile, { name: "Traveller", phone: "+2348000000001" })).id as Id<"users">;
  const senderId = (await sender.mutation(api.accounts.ensureProfile, { name: "Sender", phone: "+2348000000002" })).id as Id<"users">;
  const shipmentId = await t.run(async ctx => {
    const verifiedAt = Date.now();
    await ctx.db.patch(travellerId, { verification: "verified", identityVerificationStatus: "verified", kycTier: 1, phoneVerifiedAt: verifiedAt, phoneVerificationTime: verifiedAt });
    const id = await ctx.db.insert("shipments", { reference: "EARN-TEST", senderId, travellerId, origin: "Jos", destination: "Abuja", description: "Books", category: "Books", weightKg: 1, valueNaira: 1000, feeNaira: 500, receiverName: "Receiver", receiverPhone: "+2348000000010", status: "delivered", paymentStatus: "held", deliveredAt: Date.now() - 86400001, createdAt: Date.now(), updatedAt: Date.now(), approved: true, reservationActive: false });
    await ctx.db.insert("payments", { shipmentId: id, reference: "payment-test", amountKobo: 50000, travellerNetKobo: 45000, currency: "NGN", status: "paid", providerTransactionId: "provider-test", createdAt: Date.now() });
    return id;
  });
  const addBank = () => t.run(ctx => ctx.db.insert("bankAccounts", { userId: travellerId, bankCode: "001", accountName: "Traveller", last4: "1234", recipientCode: "NER_test", bankingProvider: "v4", nameEnquiryReference: "NER_test", encryptedAccountNumber: "encrypted", accountNumberIv: "iv", currency: "NGN", verifiedAt: Date.now(), updatedAt: Date.now() }));
  return { t, traveller, sender, travellerId, shipmentId, addBank };
}

test("earnings are private and start only after a paid delivery", async () => {
  const f = await fixture();
  expect(await f.sender.query(api.finance.earnings, {})).toEqual([]);
  expect(await f.traveller.query(api.finance.earnings, {})).toMatchObject([{ amountKobo: 45000, status: "bank_required" }]);
  await f.t.run(ctx => ctx.db.patch(f.shipmentId, { deliveredAt: undefined, status: "in_transit" }));
  expect(await f.traveller.query(api.finance.earnings, {})).toEqual([]);
});

test("payout becomes scheduled after bank setup and paid only after release", async () => {
  const f = await fixture(); await f.addBank();
  expect(await f.traveller.query(api.finance.earnings, {})).toMatchObject([{ status: "scheduled" }]);
  await f.t.run(ctx => ctx.db.patch(f.shipmentId, { paymentStatus: "released" }));
  expect(await f.traveller.query(api.finance.earnings, {})).toMatchObject([{ status: "paid", amountKobo: 45000 }]);
});

test("automatic preparation enforces 24 hours, a verified bank, and idempotent dispatch", async () => {
  const f = await fixture();
  const owner = await f.t.query(internal.financeState.automaticOwner, { shipmentId: f.shipmentId });
  const args = { subject: owner!, shipmentId: f.shipmentId, kind: "payout" as const };
  await expect(f.t.mutation(internal.financeState.prepare, args)).rejects.toThrow("V4 banking");
  await f.addBank();
  await f.t.run(ctx => ctx.db.patch(f.shipmentId, { deliveredAt: Date.now() - 1000 }));
  await expect(f.t.mutation(internal.financeState.prepare, args)).rejects.toThrow("24-hour");
  await f.t.run(ctx => ctx.db.patch(f.shipmentId, { deliveredAt: Date.now() - 86400001 }));
  const op = await f.t.mutation(internal.financeState.prepare, args);
  expect((await f.t.mutation(internal.financeState.prepare, args))._id).toBe(op._id);
  expect(await f.t.mutation(internal.financeState.dispatch, { operationId: op._id })).not.toBeNull();
  expect(await f.t.mutation(internal.financeState.dispatch, { operationId: op._id })).toBeNull();
  expect(await f.traveller.query(api.finance.earnings, {})).toMatchObject([{ status: "processing" }]);
});

test("an open dispute holds earnings and blocks automatic transfer", async () => {
  const f = await fixture(); await f.addBank();
  await f.t.run(ctx => ctx.db.insert("disputes", { shipmentId: f.shipmentId, openedBy: f.travellerId, reason: "Review needed", previousStatus: "delivered", status: "open", createdAt: Date.now() }));
  expect(await f.traveller.query(api.finance.earnings, {})).toMatchObject([{ status: "held" }]);
  const owner = await f.t.query(internal.financeState.automaticOwner, { shipmentId: f.shipmentId });
  await expect(f.t.mutation(internal.financeState.prepare, { subject: owner!, shipmentId: f.shipmentId, kind: "payout" })).rejects.toThrow();
});


test("v4 banking verifies and encrypts an account before an idempotent payout", async () => {
  const f = await fixture();
  vi.stubEnv("PAYSTACK_SECRET_KEY", "");
  vi.stubEnv("V4_VERIFICATION_API_KEY", "vk_test_passenger");
  vi.stubEnv("V4_VERIFICATION_API_SECRET", "test-secret");
  vi.stubEnv("V4_API_URL", "https://banking.test/api/v4");
  vi.stubEnv("V4_BANK_ACCOUNT_ENCRYPTION_KEY", "test-only-encryption-key-at-least-32-characters");
  const transferRequests: Array<{ body: any; idempotencyKey: string | null }> = [];
  const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const href = String(url);
    if (href.endsWith("/banks")) return new Response(JSON.stringify({ success: true, data: { banks: [{ bankCode: "090286", name: "Safe Haven Microfinance Bank" }] } }), { status: 200 });
    if (href.endsWith("/accounts/verify")) {
      const body = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({ success: true, data: { verified: true, accountName: "TRAVELLER", accountNumber: body.accountNumber, bankCode: body.bankCode, nameEnquiryReference: "NER_test" } }), { status: 200 });
    }
    if (href.endsWith("/transfers")) {
      transferRequests.push({ body: JSON.parse(String(init?.body)), idempotencyKey: new Headers(init?.headers).get("Idempotency-Key") });
      return new Response(JSON.stringify({ success: true, data: { transferReference: "V4_TRF_test" } }), { status: 200 });
    }
    return new Response(JSON.stringify({ success: false, message: "Unexpected route" }), { status: 404 });
  });
  vi.stubGlobal("fetch", fetchMock);

  expect(await f.traveller.action(api.finance.banks, {})).toEqual([{ code: "090286", name: "Safe Haven Microfinance Bank" }]);
  expect(await f.traveller.action(api.finance.setupBank, { bankCode: "090286", accountNumber: "0123456789" })).toEqual({ accountName: "TRAVELLER", bankCode: "090286", last4: "6789", ready: true });

  const stored = await f.t.run(ctx => ctx.db.query("bankAccounts").withIndex("by_user", q => q.eq("userId", f.travellerId)).unique());
  expect(stored).toMatchObject({ bankingProvider: "v4", nameEnquiryReference: "NER_test", last4: "6789" });
  expect(stored?.encryptedAccountNumber).not.toContain("0123456789");
  expect(JSON.stringify(stored)).not.toContain("0123456789");

  await f.t.action(internal.finance.automaticPayout, { shipmentId: f.shipmentId });
  await f.t.action(internal.finance.automaticPayout, { shipmentId: f.shipmentId });
  expect(transferRequests).toHaveLength(1);
  expect(transferRequests[0]?.body).toMatchObject({ nameEnquiryReference: "NER_test", amount: 450, bankCode: "090286", accountNumber: "0123456789" });
  expect(transferRequests[0]?.idempotencyKey).toMatch(/^passenger-/);
  expect(await f.traveller.query(api.finance.earnings, {})).toMatchObject([{ status: "paid", amountKobo: 45000 }]);
});
