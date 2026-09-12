import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "../convex/schema";
import { api, internal } from "../convex/_generated/api";

const modules = import.meta.glob("../convex/**/*.ts");
const fetchMock = vi.fn();
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubEnv("TERMII_API_KEY", "test-key");
  vi.stubEnv("TERMII_SENDER_ID", "Passenger");
  vi.stubEnv("TERMII_CHANNEL", "dnd");
  vi.stubEnv("TERMII_BASE_URL", "https://api.ng.termii.com");
  fetchMock.mockReset().mockImplementation(async () => new Response(JSON.stringify({ code: "ok", message_id: "msg-123" })));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
async function setup() {
  const t = convexTest(schema, modules);
  const member = t.withIdentity({ subject: "otp-member", issuer: "https://clerk.test", tokenIdentifier: "https://clerk.test|otp-member" });
  const profile = await member.mutation(api.accounts.ensureProfile, { name: "OTP member", phone: "+2348012345678" });
  return { t, member, profile };
}
function deliveredCode() { return JSON.parse(fetchMock.mock.calls.at(-1)![1].body).sms.match(/\b(\d{6})\b/)[1] as string; }

it("sends real OTP requests to Termii without exposing the code in the response", async () => {
  const { member } = await setup();
  const result = await member.action(api.accounts.requestPhoneVerification, { phone: "08012345679" });
  expect(result).not.toHaveProperty("previewCode");
  const [url, init] = fetchMock.mock.calls[0];
  expect(url).toBe("https://api.ng.termii.com/api/sms/send");
  expect(JSON.parse(init.body)).toMatchObject({ api_key: "test-key", from: "Passenger", to: "2348012345679", channel: "dnd", type: "plain" });
  const code = deliveredCode();
  await expect(member.action(api.accounts.confirmPhoneVerification, { code })).resolves.toHaveProperty("verifiedAt");
  await expect(member.action(api.accounts.confirmPhoneVerification, { code })).rejects.toThrow("expired");
});
it("enforces resend cooldown, persistent attempt limits and expiry", async () => {
  const { member } = await setup();
  await member.action(api.accounts.requestPhoneVerification, { phone: "+2348012345679" });
  const code = deliveredCode();
  await expect(member.action(api.accounts.requestPhoneVerification, { phone: "+2348012345679" })).rejects.toThrow("wait");
  expect(fetchMock).toHaveBeenCalledTimes(1);
  const wrong = code === "000000" ? "000001" : "000000";
  for (let i = 0; i < 5; i++) await expect(member.action(api.accounts.confirmPhoneVerification, { code: wrong })).rejects.toThrow("not correct");
  await expect(member.action(api.accounts.confirmPhoneVerification, { code })).rejects.toThrow("Too many attempts");
  vi.advanceTimersByTime(63_000);
  await member.action(api.accounts.requestPhoneVerification, { phone: "+2348012345679" });
  const next = deliveredCode();
  vi.advanceTimersByTime(600_001);
  await expect(member.action(api.accounts.confirmPhoneVerification, { code: next })).rejects.toThrow("expired");
});
it("skips OTP without credentials, saves an unverified phone, and restores verification when configured", async () => {
  const { t, member } = await setup();
  vi.stubEnv("TERMII_API_KEY", "");
  await expect(member.action(api.accounts.requestPhoneVerification, { phone: "+2348012345679" })).resolves.toMatchObject({ skipped: true, phone: "+2348012345679" });
  const user = await t.run(ctx => ctx.db.query("users").first());
  expect(user?.phone).toBe("+2348012345679");
  expect(user?.phoneVerificationTime).toBeUndefined();
  expect((await member.query(api.accounts.me, {}))?.phoneVerificationEnabled).toBe(false);
  vi.stubEnv("TERMII_API_KEY", "test-key");
  expect((await member.query(api.accounts.me, {}))?.phoneVerificationEnabled).toBe(true);
  await expect(member.mutation(internal.accounts.savePhoneWithoutOtp, { phone: "+2348012345679" })).rejects.toThrow("required");
  expect(fetchMock).not.toHaveBeenCalled();
});
it.each([
  [422, { code: "failed", message: "private provider detail" }],
  [200, { code: "ok" }],
  [200, { code: "failed", message_id: "id" }],
])("rejects unsuccessful or malformed Termii responses (%s)", async (status, body) => {
  const t = convexTest(schema, modules);
  fetchMock.mockResolvedValue(new Response(JSON.stringify(body), { status }));
  await expect(t.action(internal.sms.sendDeliveryCode, { receiverPhone: "+2348012345679", shipmentReference: "P-123", code: "12345678" })).rejects.toThrow("could not send");
});
it("handles network failures", async () => {
  const t = convexTest(schema, modules);
  fetchMock.mockRejectedValue(new Error("network failed"));
  await expect(t.action(internal.sms.sendPhoneVerificationCode, { receiverPhone: "+2348012345679", code: "123456" })).rejects.toThrow("could not connect");
});
