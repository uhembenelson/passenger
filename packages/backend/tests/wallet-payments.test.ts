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
  expect(await sender.query(api.wallet.balance)).toMatchObject({ balanceNaira: 0 });
  expect(await t.query(internal.wallet.depositByReference, { reference: payment.reference })).toMatchObject({ amountKobo: 700000, status: "pending" });
  await expect(stranger.action(api.wallet.verifyTopUp, { reference: payment.reference })).rejects.toThrow("Payment not found");
  expect(fetchMock).toHaveBeenCalledTimes(1);
  vi.stubGlobal("fetch", vi.fn(async () => response({ reference: payment.reference, amount: 700000, currency: "NGN", status: "success", id: 42 })));
  await expect(sender.action(api.wallet.verifyTopUp, { reference: payment.reference })).resolves.toEqual({ success: true, balanceNaira: 7000 });
  await sender.action(api.wallet.verifyTopUp, { reference: payment.reference });
  expect(await sender.query(api.wallet.balance)).toMatchObject({ balanceNaira: 7000 });
});
it("rejects mismatched references, amounts and currency without credit", async () => {
  const { t, sender, userId } = await setup();
  await t.mutation(internal.wallet.reserveTopUp, { userId, reference: "wallet-test", amountKobo: 100000 });
  for (const mismatch of [{ reference: "another" }, { amount: 100001 }, { currency: "USD" }]) {
    vi.stubGlobal("fetch", vi.fn(async () => response({ reference: "wallet-test", amount: 100000, currency: "NGN", status: "success", id: 42, ...mismatch })));
    await expect(sender.action(api.wallet.verifyTopUp, { reference: "wallet-test" })).rejects.toThrow("did not match");
  }
  expect(await sender.query(api.wallet.balance)).toMatchObject({ balanceNaira: 0 });
});
it("rejects unreserved credits and fractional top-ups", async () => {
  const { t, sender, userId } = await setup();
  await expect(t.mutation(internal.wallet.recordTopUp, { userId, reference: "unknown", amountNaira: 1000, providerTransactionId: "unknown" })).rejects.toThrow("saved payment");
  await expect(sender.action(api.wallet.initializeTopUp, { amountNaira: 1000.5 })).rejects.toThrow("whole-naira");
});
it("accepts only Paystack checkout URLs and does not credit pending transactions", async () => {
  const { t, sender, userId } = await setup();
  vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => response({ reference: JSON.parse(init.body as string).reference, authorization_url: "https://example.com/checkout" })));
  await expect(sender.action(api.wallet.initializeTopUp, { amountNaira: 1000 })).rejects.toThrow("Invalid payment checkout URL");
  const pending = await sender.query(api.wallet.pendingDeposit);
  expect(pending).not.toBeNull();
  const reference = pending!.reference;
  vi.stubGlobal("fetch", vi.fn(async () => response({ reference, amount: 100000, currency: "NGN", status: "pending" })));
  await expect(sender.action(api.wallet.verifyTopUp, { reference })).resolves.toEqual({ success: false, balanceNaira: 0 });
});

it("settles signed webhooks against the saved owner and ignores replay", async () => {
  const { t, sender, stranger, userId } = await setup();
  await t.mutation(internal.wallet.reserveTopUp, { userId, reference: "wallet-hook", amountKobo: 100000 });
  const body = JSON.stringify({ event: "charge.success", data: { reference: "wallet-hook", amount: 100000, currency: "NGN", status: "success", id: 42, metadata: { subject: "stranger" } } });
  const signature = createHmac("sha512", "sk_test_example").update(body).digest("hex");
  expect(await t.action(internal.payments.receiveWebhook, { body, signature: "0".repeat(128) })).toEqual({ status: 401 });
  expect(await sender.query(api.wallet.balance)).toMatchObject({ balanceNaira: 0 });
  expect(await t.action(internal.payments.receiveWebhook, { body, signature })).toEqual({ status: 200 });
  expect(await t.action(internal.payments.receiveWebhook, { body, signature })).toEqual({ status: 200 });
  expect(await sender.query(api.wallet.balance)).toMatchObject({ balanceNaira: 1000 });
  expect(await stranger.query(api.wallet.balance)).toMatchObject({ balanceNaira: 0 });
});

it("reuses concurrent checkout attempts and persists recovery on the server", async () => {
  const { sender, t } = await setup();
  const fetchMock = vi.fn(async (_url: string, init: RequestInit) => response({ reference: JSON.parse(init.body as string).reference, authorization_url: "https://checkout.paystack.com/recover" }));
  vi.stubGlobal("fetch", fetchMock);
  const attempts = await Promise.allSettled([sender.action(api.wallet.initializeTopUp, { amountNaira: 1000 }), sender.action(api.wallet.initializeTopUp, { amountNaira: 1000 })]);
  expect(attempts.some(a => a.status === "fulfilled")).toBe(true);
  expect(fetchMock).toHaveBeenCalledTimes(1);
  const pending = await sender.query(api.wallet.pendingDeposit);
  expect(pending).toMatchObject({ amount: 1000, url: "https://checkout.paystack.com/recover" });
  const again = await sender.action(api.wallet.initializeTopUp, { amountNaira: 1000 });
  expect(again.reference).toBe(pending!.reference);
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(await t.run(ctx => ctx.db.query("walletDeposits").collect())).toHaveLength(1);
});
it("preserves uncertain initialization without issuing another provider request", async () => {
  const { sender, t } = await setup();
  const fetchMock = vi.fn(async () => { throw new Error("timeout"); }); vi.stubGlobal("fetch", fetchMock);
  await expect(sender.action(api.wallet.initializeTopUp, { amountNaira: 1000 })).rejects.toThrow();
  const pending = await sender.query(api.wallet.pendingDeposit);
  expect(pending?.reference).toMatch(/^wallet-/);
  await expect(sender.action(api.wallet.initializeTopUp, { amountNaira: 1000 })).rejects.toThrow("another checkout was not created");
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(await t.run(ctx => ctx.db.query("walletDeposits").collect())).toHaveLength(1);
});
it("allows a new checkout only after the provider confirms terminal failure", async () => {
  const { sender, t, userId } = await setup();
  await t.mutation(internal.wallet.reserveTopUp, { userId, reference: "wallet-failed", amountKobo: 100000 });
  vi.stubGlobal("fetch", vi.fn(async () => response({ reference: "wallet-failed", amount: 100000, currency: "NGN", status: "failed" })));
  await sender.action(api.wallet.verifyTopUp, { reference: "wallet-failed" });
  expect(await sender.query(api.wallet.pendingDeposit)).toBeNull();
  vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => response({ reference: JSON.parse(init.body as string).reference, authorization_url: "https://checkout.paystack.com/new" })));
  expect((await sender.action(api.wallet.initializeTopUp, { amountNaira: 2000 })).reference).not.toBe("wallet-failed");
});
it("throttles payment requests in a server transaction", async () => {
  const { t } = await setup();
  for (let i = 0; i < 10; i++) await t.mutation(internal.wallet.rateLimit, { subject: "sender", kind: "verify" });
  await expect(t.mutation(internal.wallet.rateLimit, { subject: "sender", kind: "verify" })).rejects.toThrow("Too many");
});
it("reconciles missed webhooks and checks the credited transaction for disputes", async () => {
  const { t, sender, userId } = await setup();
  await t.mutation(internal.wallet.reserveTopUp, { userId, reference: "wallet-reconcile", amountKobo: 100000 });
  vi.stubGlobal("fetch", vi.fn(async (url: string) => url.includes("/dispute/") ? new Response(JSON.stringify({ status: true, data: [] })) : response({ reference: "wallet-reconcile", amount: 100000, currency: "NGN", status: "success", id: 123 })));
  await t.action(internal.wallet.reconcileDeposit, { reference: "wallet-reconcile" });
  expect(await sender.query(api.wallet.balance)).toMatchObject({ balanceNaira: 1000 });
  expect((await t.query(internal.wallet.depositByReference, { reference: "wallet-reconcile" }))?.nextCheckAt).toBeGreaterThan(Date.now());
});
it("records one durable alert for repeated unresolved verification", async () => {
  const { t, userId, stranger } = await setup();
  const reserved = await t.mutation(internal.wallet.reserveTopUp, { userId, reference: "wallet-stuck", amountKobo: 100000 });
  await t.run(ctx => ctx.db.patch(reserved.deposit._id, { createdAt: Date.now() - 1800000 }));
  await t.mutation(internal.wallet.checkFailed, { reference: "wallet-stuck" });
  await t.mutation(internal.wallet.checkFailed, { reference: "wallet-stuck" });
  expect(await t.run(ctx => ctx.db.query("paymentAlerts").collect())).toHaveLength(1);
  await expect(stranger.query(api.wallet.alerts)).rejects.toThrow();
});
it("debits a partial provider refund once and does not double debit a later full reversal", async () => {
  const { t, sender, userId } = await setup();
  await t.mutation(internal.wallet.reserveTopUp, { userId, reference: "wallet-reversed", amountKobo: 100000 });
  await t.mutation(internal.wallet.recordTopUp, { userId, reference: "wallet-reversed", amountNaira: 1000, providerTransactionId: "900" });
  const args = { reference: "wallet-reversed", providerId: "refund-1", providerTransactionId: "900", amountKobo: 25000, currency: "NGN" };
  await t.mutation(internal.wallet.recordProviderRefund, args);
  await t.mutation(internal.wallet.recordProviderRefund, args);
  expect(await sender.query(api.wallet.balance)).toMatchObject({ balanceNaira: 750, blocked: true });
  await t.mutation(internal.wallet.flagRisk, { reference: args.reference, eventId: "reversal", reversed: true });
  await t.mutation(internal.wallet.flagRisk, { reference: args.reference, eventId: "reversal", reversed: true });
  expect(await sender.query(api.wallet.balance)).toMatchObject({ balanceNaira: 0, blocked: true });
  await expect(sender.action(api.wallet.initializeTopUp, { amountNaira: 1000 })).rejects.toThrow("review");
});
it("does not mix test deposits into live wallets", async () => {
  const { t, sender, userId } = await setup();
  await t.mutation(internal.wallet.reserveTopUp, { userId, reference: "wallet-test-mode", amountKobo: 100000 });
  await t.mutation(internal.wallet.recordTopUp, { userId, reference: "wallet-test-mode", amountNaira: 1000, providerTransactionId: "901" });
  vi.stubEnv("PAYSTACK_SECRET_KEY", "sk_live_example");
  await expect(sender.action(api.wallet.initializeTopUp, { amountNaira: 1000 })).rejects.toThrow("environment");
});
it("requires independent provider resolution and admin access to release a dispute hold", async () => {
  const { t, sender, userId } = await setup();
  vi.stubEnv("ADMIN_CLERK_SUBJECTS", "admin");
  const admin = t.withIdentity({ subject: "admin" });
  await admin.mutation(api.accounts.ensureProfile, { name: "Admin", phone: "+2348000000098" });
  await t.mutation(internal.wallet.reserveTopUp, { userId, reference: "wallet-dispute", amountKobo: 100000 });
  await t.mutation(internal.wallet.recordTopUp, { userId, reference: "wallet-dispute", amountNaira: 1000, providerTransactionId: "123" });
  await t.mutation(internal.wallet.flagRisk, { reference: "wallet-dispute", eventId: "dispute-1", reversed: false });
  const args = { reference: "wallet-dispute", note: "Reviewed the resolved provider dispute." };
  await expect(sender.action(api.wallet.reviewDispute, args)).rejects.toThrow("Administrator");
  let status = "pending";
  vi.stubGlobal("fetch", vi.fn(async (url: string) => new Response(JSON.stringify({ status: true, data: url.includes("/dispute/") ? [{ status, resolution: "declined", transaction: { id: 123, reference: "wallet-dispute" } }] : { status: "success", id: 123, reference: "wallet-dispute", amount: 100000, currency: "NGN" } }))));
  await expect(admin.action(api.wallet.reviewDispute, args)).rejects.toThrow("All disputes");
  expect(await sender.query(api.wallet.balance)).toMatchObject({ blocked: true });
  status = "resolved";
  await admin.action(api.wallet.reviewDispute, args);
  expect(await sender.query(api.wallet.balance)).toMatchObject({ blocked: false, balanceNaira: 1000 });
});
it("rejects an admin review racing with a newer risk event", async () => {
  const { t, userId } = await setup();
  vi.stubEnv("ADMIN_CLERK_SUBJECTS", "admin");
  await t.withIdentity({ subject: "admin" }).mutation(api.accounts.ensureProfile, { name: "Admin", phone: "+2348000000098" });
  await t.mutation(internal.wallet.reserveTopUp, { userId, reference: "wallet-risk-race", amountKobo: 100000 });
  await t.mutation(internal.wallet.recordTopUp, { userId, reference: "wallet-risk-race", amountNaira: 1000, providerTransactionId: "124" });
  await t.mutation(internal.wallet.flagRisk, { reference: "wallet-risk-race", eventId: "dispute-1", reversed: false });
  const p = await t.query(internal.wallet.depositByReference, { reference: "wallet-risk-race" });
  await t.mutation(internal.wallet.flagRisk, { reference: "wallet-risk-race", eventId: "dispute-2", reversed: false });
  await expect(t.mutation(internal.wallet.clearDisputeHold, { subject: "admin", reference: "wallet-risk-race", riskVersion: p!.riskVersion!, note: "Reviewed old state" })).rejects.toThrow("risk state changed");
});
it("independently verifies a refund webhook and ignores replay", async () => {
  const { t, sender, userId } = await setup();
  await t.mutation(internal.wallet.reserveTopUp, { userId, reference: "wallet-refund-webhook", amountKobo: 100000 });
  await t.mutation(internal.wallet.recordTopUp, { userId, reference: "wallet-refund-webhook", amountNaira: 1000, providerTransactionId: "125" });
  const body = JSON.stringify({ event: "refund.processed", data: { id: 700, transaction: 125 } });
  const signature = createHmac("sha512", "sk_test_example").update(body).digest("hex");
  vi.stubGlobal("fetch", vi.fn(async () => response({ id: 700, transaction: 125, status: "processed", amount: 25000, currency: "NGN" })));
  expect(await t.action(internal.payments.receiveWebhook, { body, signature })).toEqual({ status: 200 });
  expect(await t.action(internal.payments.receiveWebhook, { body, signature })).toEqual({ status: 200 });
  expect(await sender.query(api.wallet.balance)).toMatchObject({ blocked: true, balanceNaira: 750 });
});
