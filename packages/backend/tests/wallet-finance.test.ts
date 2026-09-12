import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "../convex/schema";
import { api, internal } from "../convex/_generated/api";
import { deductForShipment, refundForShipment } from "../convex/wallet";
import type { Id } from "../convex/_generated/dataModel";
const modules = import.meta.glob("../convex/**/*.ts");
beforeEach(() => vi.stubEnv("PAYSTACK_SECRET_KEY", "sk_test_example"));
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
    await ctx.db.patch(userId, { verification: "verified" });
    await ctx.db.patch(travellerId, { verification: "verified" });
    await ctx.db.insert("bankAccounts", { userId: travellerId, bankCode: "001", accountName: "Traveller", last4: "1234", recipientCode: "RCP_test", currency: "NGN", verifiedAt: Date.now(), updatedAt: Date.now() });
    const id = await ctx.db.insert("shipments", { senderId: userId, travellerId, reference: "WALLET-PARCEL", origin: "Jos", destination: "Abuja", description: "Books", category: "Books", weightKg: 1, valueNaira: 1000, feeNaira: 5000, receiverName: "Receiver", receiverPhone: "+2348000000099", status: "delivered", paymentStatus: "held", approved: true, reservationActive: false, deliveredAt: Date.now() - 86400001, createdAt: Date.now(), updatedAt: Date.now() });
    await deductForShipment(ctx, (await ctx.db.get(userId))!, id, 5000);
    return id;
  });
  return { t, sender, traveller, userId, shipmentId };
}
it("pays a wallet-funded delivery through Paystack once after delivery eligibility", async () => {
  const { t, traveller, shipmentId } = await fixture();
  let reference = "";
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.endsWith("/transfer")) {
      const request = JSON.parse(init!.body as string); reference = request.reference;
      expect(request.amount).toBe(450000);
      return new Response(JSON.stringify({ status: true, data: { transfer_code: "TRF_wallet" } }));
    }
    return new Response(JSON.stringify({ status: true, data: { transfer_code: "TRF_wallet", reference, recipient: "RCP_test", amount: 450000, currency: "NGN", status: "success" } }));
  }); vi.stubGlobal("fetch", fetchMock);
  await t.action(internal.finance.automaticPayout, { shipmentId });
  await t.action(internal.finance.automaticPayout, { shipmentId });
  expect(fetchMock).toHaveBeenCalledTimes(2);
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
