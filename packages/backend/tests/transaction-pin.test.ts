import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "../convex/schema";
import { api } from "../convex/_generated/api";

const modules = import.meta.glob("../convex/**/*.ts");
const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubEnv("TRANSACTION_PIN_PEPPER", "test-transaction-pin-pepper-that-is-long-enough");
  vi.stubEnv("RESEND_API_KEY", "re_test");
  vi.stubEnv("AUTH_EMAIL_FROM", "Passenger <security@usepassenger.com>");
  fetchMock.mockReset().mockResolvedValue({ ok: true, status: 200, json: async () => ({ id: "email_pin" }) });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

function deliveredCode() {
  const payload = JSON.parse(String(fetchMock.mock.calls.at(-1)?.[1]?.body));
  const code = String(payload.text).match(/\b(\d{6})\b/)?.[1];
  expect(code).toBeDefined();
  return code!;
}

it("uses a single-use email code to reset a forgotten transaction PIN", async () => {
  const t = convexTest(schema, modules);
  const member = t.withIdentity({ subject: "member", email: "member@example.com" });
  await member.mutation(api.accounts.ensureProfile, { name: "Member", phone: "+2348000000042" });

  expect(await member.mutation(api.wallet.setTransactionPin, { pin: "1234" })).toMatchObject({ success: true });
  expect(await member.action(api.wallet.requestTransactionPinChangeCode, {})).toEqual({ sentTo: "me****@example.com" });
  const resetCode = deliveredCode();

  expect(await member.mutation(api.wallet.setTransactionPin, { pin: "5678", emailCode: "000000", resetWithEmail: true })).toMatchObject({ success: false });
  expect(await member.mutation(api.wallet.setTransactionPin, { pin: "5678", emailCode: resetCode, resetWithEmail: true })).toMatchObject({ success: true });
  expect(await member.mutation(api.wallet.setTransactionPin, { pin: "9999", emailCode: resetCode, resetWithEmail: true })).toMatchObject({ success: false });

  await member.action(api.wallet.requestTransactionPinChangeCode, {});
  const changeCode = deliveredCode();
  expect(await member.mutation(api.wallet.setTransactionPin, { pin: "9012", currentPin: "1234", emailCode: changeCode })).toMatchObject({ success: false });
  expect(await member.mutation(api.wallet.setTransactionPin, { pin: "9012", currentPin: "5678", emailCode: changeCode })).toMatchObject({ success: true });

  const events = await t.run(ctx => ctx.db.query("audits").collect());
  expect(events.some(event => event.action === "wallet.transaction_pin_reset")).toBe(true);
});
