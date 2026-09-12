import { createHmac } from "node:crypto";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "../convex/schema";
import { api, internal } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
const modules = import.meta.glob("../convex/**/*.ts");
const identity = (subject: string) => ({ subject, email: `${subject}@example.com`, issuer: "https://clerk.test", tokenIdentifier: `https://clerk.test|${subject}` });
beforeEach(() => { vi.stubEnv("PAYSTACK_SECRET_KEY", "sk_test_example"); vi.stubEnv("PAYSTACK_CALLBACK_URL", ""); });
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
async function setup() {
  const t = convexTest(schema, modules);
  const sender = t.withIdentity(identity("sender"));
  const stranger = t.withIdentity(identity("stranger"));
  const profile = await sender.mutation(api.accounts.ensureProfile, { name: "Sender", phone: "+2348000000002" });
  await stranger.mutation(api.accounts.ensureProfile, { name: "Stranger", phone: "+2348000000003" });
  return { t, sender, stranger, userId: profile.id as Id<"users"> };
}
const response = (data: object) => new Response(JSON.stringify({ status: true, data }), { status: 200 });
it("initializes a saved deposit and credits a verified payment exactly once", async () => {
  const { t, sender, stranger } = await setup();
  const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
    const request = JSON.parse(init.body as string);
    expect(request.amount).toBe(700000);
    expect(request.currency).toBe("NGN");
    return response({ reference: request.reference, authorization_url: "https://checkout.paystack.com/test" });
  });
  vi.stubGlobal("fetch", fetchMock);
  const payment = await sender.action(api.wallet.initializeTopUp, { amountNaira: 7000 });
  expect(await sender.query(api.wallet.balance)).toEqual({ balanceNaira: 0 });
  expect(await t.query(internal.wallet.depositByReference, { reference: payment.reference })).toMatchObject({ amountKobo: 700000, status: "pending" });
  await expect(stranger.action(api.wallet.verifyTopUp, { reference: payment.reference })).rejects.toThrow("Payment not found");
  expect(fetchMock).toHaveBeenCalledTimes(1);
  vi.stubGlobal("fetch", vi.fn(async () => response({ reference: payment.reference, amount: 700000, currency: "NGN", status: "success" })));
  await expect(sender.action(api.wallet.verifyTopUp, { reference: payment.reference })).resolves.toEqual({ success: true, balanceNaira: 7000 });
  await sender.action(api.wallet.verifyTopUp, { reference: payment.reference });
  expect(await sender.query(api.wallet.balance)).toEqual({ balanceNaira: 7000 });
});
it("rejects mismatched references, amounts and currency without credit", async () => {
  const { t, sender, userId } = await setup();
  await t.mutation(internal.wallet.reserveTopUp, { userId, reference: "wallet-test", amountKobo: 100000 });
  for (const mismatch of [{ reference: "another" }, { amount: 100001 }, { currency: "USD" }]) {
    vi.stubGlobal("fetch", vi.fn(async () => response({ reference: "wallet-test", amount: 100000, currency: "NGN", status: "success", ...mismatch })));
    await expect(sender.action(api.wallet.verifyTopUp, { reference: "wallet-test" })).rejects.toThrow("did not match");
  }
  expect(await sender.query(api.wallet.balance)).toEqual({ balanceNaira: 0 });
});
it("rejects unreserved credits and fractional top-ups", async () => {
  const { t, sender, userId } = await setup();
  await expect(t.mutation(internal.wallet.recordTopUp, { userId, reference: "unknown", amountNaira: 1000 })).rejects.toThrow("saved payment");
  await expect(sender.action(api.wallet.initializeTopUp, { amountNaira: 1000.5 })).rejects.toThrow("whole-naira");
});
it("accepts only Paystack checkout URLs and does not credit pending transactions", async () => {
  const { t, sender, userId } = await setup();
  vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => response({ reference: JSON.parse(init.body as string).reference, authorization_url: "https://example.com/checkout" })));
  await expect(sender.action(api.wallet.initializeTopUp, { amountNaira: 1000 })).rejects.toThrow("Invalid payment checkout URL");
  await t.mutation(internal.wallet.reserveTopUp, { userId, reference: "wallet-pending", amountKobo: 100000 });
  vi.stubGlobal("fetch", vi.fn(async () => response({ reference: "wallet-pending", amount: 100000, currency: "NGN", status: "pending" })));
  await expect(sender.action(api.wallet.verifyTopUp, { reference: "wallet-pending" })).resolves.toEqual({ success: false, balanceNaira: 0 });
});

it("settles signed webhooks against the saved owner and ignores replay", async () => {
  const { t, sender, stranger, userId } = await setup();
  await t.mutation(internal.wallet.reserveTopUp, { userId, reference: "wallet-hook", amountKobo: 100000 });
  const body = JSON.stringify({ event: "charge.success", data: { id: 12345, reference: "wallet-hook", amount: 100000, currency: "NGN", status: "success", metadata: { subject: "stranger" } } });
  const signature = createHmac("sha512", "sk_test_example").update(body).digest("hex");
  expect(await t.action(internal.payments.receiveWebhook, { body, signature: "0".repeat(128) })).toEqual({ status: 401 });
  expect(await sender.query(api.wallet.balance)).toEqual({ balanceNaira: 0 });
  expect(await t.action(internal.payments.receiveWebhook, { body, signature })).toEqual({ status: 200 });
  expect(await t.action(internal.payments.receiveWebhook, { body, signature })).toEqual({ status: 200 });
  expect(await sender.query(api.wallet.balance)).toEqual({ balanceNaira: 1000 });
  expect(await stranger.query(api.wallet.balance)).toEqual({ balanceNaira: 0 });
});
