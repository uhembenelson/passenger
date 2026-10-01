import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "../convex/schema";
import { api, internal } from "../convex/_generated/api";
import { deductForShipment, refundForShipment } from "../convex/wallet";
import type { Id } from "../convex/_generated/dataModel";
const modules = import.meta.glob("../convex/**/*.ts");
beforeEach(() => {
  vi.stubEnv("PAYSTACK_SECRET_KEY", "sk_test_example");
  vi.stubEnv("V4_VERIFICATION_API_KEY", "vk_test_passenger");
  vi.stubEnv("V4_VERIFICATION_API_SECRET", "test-secret");
  vi.stubEnv("V4_API_URL", "https://banking.test/api/v4");
  vi.stubEnv("V4_BANK_ACCOUNT_ENCRYPTION_KEY", "test-only-encryption-key-at-least-32-characters");
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
async function fixture() {
  const t = convexTest(schema, modules);
  const sender = t.withIdentity({ subject: "sender", email: "sender@example.com" });
  const traveller = t.withIdentity({ subject: "traveller" });
  const userId = (await sender.mutation(api.accounts.ensureProfile, { name: "Sender", phone: "+2348000000011" })).id as Id<"users">;
  const travellerId = (await traveller.mutation(api.accounts.ensureProfile, { name: "Traveller", phone: "+2348000000012" })).id as Id<"users">;
  await t.mutation(internal.wallet.reserveTopUp, { userId, reference: "wallet-funding", amountKobo: 1000000 });
  await t.mutation(internal.wallet.recordTopUp, { userId, reference: "wallet-funding", amountNaira: 10000, providerTransactionId: "100" });
  const shipmentId = await t.run(async ctx => {
    const verifiedAt = Date.now();
    await ctx.db.patch(userId, { verification: "verified", identityVerificationStatus: "verified", kycTier: 1, phoneVerifiedAt: verifiedAt, phoneVerificationTime: verifiedAt });
    await ctx.db.patch(travellerId, { verification: "verified", identityVerificationStatus: "verified", kycTier: 1, phoneVerifiedAt: verifiedAt, phoneVerificationTime: verifiedAt });
    const id = await ctx.db.insert("shipments", { senderId: userId, travellerId, reference: "WALLET-PARCEL", origin: "Jos", destination: "Abuja", description: "Books", category: "Books", weightKg: 1, valueNaira: 1000, feeNaira: 5000, receiverName: "Receiver", receiverPhone: "+2348000000099", status: "delivered", paymentStatus: "held", approved: true, reservationActive: false, deliveredAt: Date.now() - 86400001, createdAt: Date.now(), updatedAt: Date.now() });
    await deductForShipment(ctx, (await ctx.db.get(userId))!, id, 5000);
    return id;
  });
  vi.stubGlobal("fetch", vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body));
    return new Response(JSON.stringify({ success: true, data: { verified: true, accountName: "TRAVELLER", accountNumber: body.accountNumber, bankCode: body.bankCode, nameEnquiryReference: "NER_wallet" } }), { status: 200 });
  }));
  await traveller.action(api.finance.setupBank, { bankCode: "001", accountNumber: "0123451234" });
  vi.unstubAllGlobals();
  return { t, sender, traveller, userId, shipmentId };
}
it("pays a wallet-funded delivery through V4 once after delivery eligibility", async () => {
  const { t, traveller, shipmentId } = await fixture();
  const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    expect(String(url)).toContain("/transfers");
    const request = JSON.parse(String(init?.body));
    expect(request).toMatchObject({ amount: 4500, bankCode: "001", accountNumber: "0123451234", nameEnquiryReference: "NER_wallet" });
    expect(new Headers(init?.headers).get("Idempotency-Key")).toMatch(/^passenger-/);
    return new Response(JSON.stringify({ success: true, data: { transferReference: "V4_TRF_wallet" } }));
  }); vi.stubGlobal("fetch", fetchMock);
  await t.action(internal.finance.automaticPayout, { shipmentId });
  await t.action(internal.finance.automaticPayout, { shipmentId });
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(await traveller.query(api.finance.earnings)).toMatchObject([{ status: "paid", amountKobo: 450000 }]);
});
it("returns an approved wallet refund once without calling the provider", async () => {
  const { t, sender, shipmentId } = await fixture();
  await t.run(ctx => ctx.db.patch(shipmentId, { refundApproved: true }));
  const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
  await sender.action(api.finance.requestRefund, { shipmentId });
  await sender.action(api.finance.requestRefund, { shipmentId });
  expect(fetchMock).not.toHaveBeenCalled();
  expect(await sender.query(api.wallet.balance)).toMatchObject({ balanceNaira: 10000 });
});
it("blocks spending and an already-prepared payout after a deposit dispute", async () => {
  const { t, userId, shipmentId } = await fixture();
  const op = await t.mutation(internal.financeState.prepare, { subject: "traveller", shipmentId, kind: "payout" });
  await t.mutation(internal.wallet.flagRisk, { reference: "wallet-funding", eventId: "dispute-1", reversed: false });
  await expect(t.mutation(internal.financeState.dispatch, { operationId: op._id })).rejects.toThrow("review");
  await expect(t.run(async ctx => deductForShipment(ctx, (await ctx.db.get(userId))!, shipmentId, 100))).rejects.toThrow("review");
});
it("prevents refunding held money while a transfer is in flight", async () => {
  const { t, userId, shipmentId } = await fixture();
  const op = await t.mutation(internal.financeState.prepare, { subject: "traveller", shipmentId, kind: "payout" });
  await t.mutation(internal.financeState.dispatch, { operationId: op._id });
  await expect(t.run(async ctx => refundForShipment(ctx, (await ctx.db.get(userId))!, shipmentId, 5000, "Cancel"))).rejects.toThrow("operation exists");
});
it("keeps spent chargebacks as debt and blocks live payouts from test funding", async () => {
  const { t, userId, shipmentId } = await fixture();
  vi.stubEnv("PAYSTACK_SECRET_KEY", "sk_live_example");
  await expect(t.mutation(internal.financeState.prepare, { subject: "traveller", shipmentId, kind: "payout" })).rejects.toThrow("environment");
  await t.mutation(internal.wallet.flagRisk, { reference: "wallet-funding", eventId: "reversal", reversed: true });
  expect((await t.run(ctx => ctx.db.get(userId)))?.walletVerifiedBalanceNaira).toBe(-5000);
});
it("does not authorize an old simulated balance for new holds", async () => {
  const { t, userId, shipmentId } = await fixture();
  await t.run(ctx => ctx.db.patch(userId, { walletVerifiedBalanceNaira: undefined, walletBalanceNaira: 100000 }));
  await expect(t.run(async ctx => deductForShipment(ctx, (await ctx.db.get(userId))!, shipmentId, 100))).rejects.toThrow("verified wallet balance");
});
