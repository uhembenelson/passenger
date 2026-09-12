/// <reference types="vite/client" />
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { generateKeyPairSync } from "node:crypto";
import { convexTest } from "convex-test";
import schema from "../convex/schema";
import { api } from "../convex/_generated/api";
const modules = import.meta.glob("../convex/**/*.ts");
const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const fetchMock = vi.fn();
const email = "signup@example.com";
const params = { email, password: "StrongPassword123" };
beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("RESEND_API_KEY", "re_test");
  vi.stubEnv("AUTH_EMAIL_FROM", "Passenger <accounts@example.com>");
  vi.stubEnv("SITE_URL", "https://app.example.com");
  vi.stubEnv("CONVEX_SITE_URL", "https://example.convex.site");
  vi.stubEnv("JWT_PRIVATE_KEY", privateKey.export({ type: "pkcs8", format: "pem" }).toString());
  fetchMock.mockReset().mockImplementation(async () => new Response(JSON.stringify({ id: "email-123" })));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.useRealTimers(); });
function codeFromEmail() {
  const payload = JSON.parse(fetchMock.mock.calls.at(-1)![1].body);
  expect(payload.subject).toBe("Verify your Passenger email");
  expect(payload.to).toBe(email);
  return payload.text.match(/:\n([A-Za-z0-9]+)\n/)[1] as string;
}
it("sends signup verification, withholds a session, and consumes the emailed code once", async () => {
  const t = convexTest(schema, modules);
  const result = await t.action(api.auth.signIn, { provider: "password", params: { ...params, flow: "signUp" } });
  expect(result.tokens).toBeNull();
  expect(fetchMock).toHaveBeenCalledTimes(1);
  const code = codeFromEmail();
  expect((await t.run(ctx => ctx.db.query("users").first()))?.emailVerificationTime).toBeUndefined();
  await expect(t.action(api.auth.signIn, { provider: "password", params: { email, flow: "email-verification", code: "wrong" } })).rejects.toThrow();
  const verified = await t.action(api.auth.signIn, { provider: "password", params: { email, flow: "email-verification", code } });
  expect(verified.tokens).toBeTruthy();
  expect((await t.run(ctx => ctx.db.query("users").first()))?.emailVerificationTime).toBeTypeOf("number");
  await expect(t.action(api.auth.signIn, { provider: "password", params: { email, flow: "email-verification", code } })).rejects.toThrow();
  expect((await t.action(api.auth.signIn, { provider: "password", params: { ...params, flow: "signIn" } })).tokens).toBeTruthy();
  expect(fetchMock).toHaveBeenCalledTimes(1);
});
it("resends for unverified sign-in, invalidates old codes and expires verification", async () => {
  const t = convexTest(schema, modules);
  await t.action(api.auth.signIn, { provider: "password", params: { ...params, flow: "signUp" } });
  const oldCode = codeFromEmail();
  expect((await t.action(api.auth.signIn, { provider: "password", params: { ...params, flow: "signIn" } })).tokens).toBeNull();
  expect(fetchMock).toHaveBeenCalledTimes(2);
  await expect(t.action(api.auth.signIn, { provider: "password", params: { email, flow: "email-verification", code: oldCode } })).rejects.toThrow();
  await t.action(api.auth.signIn, { provider: "password", params: { email, flow: "email-verification" } });
  const code = codeFromEmail();
  vi.useFakeTimers();
  vi.setSystemTime(Date.now() + 601_000);
  await expect(t.action(api.auth.signIn, { provider: "password", params: { email, flow: "email-verification", code } })).rejects.toThrow();
});
it("does not sign in when Resend rejects delivery", async () => {
  const t = convexTest(schema, modules);
  fetchMock.mockImplementation(async () => new Response(JSON.stringify({ message: "Sending domain is not verified" }), { status: 403 }));
  await expect(t.action(api.auth.signIn, { provider: "password", params: { ...params, flow: "signUp" } })).rejects.toThrow("domain is not verified");
  expect(await t.run(ctx => ctx.db.query("authSessions").collect())).toEqual([]);
});

it.each(["RESEND_API_KEY", "AUTH_EMAIL_FROM"])("skips email verification when %s is missing without claiming the address is verified", async (key) => {
  vi.stubEnv(key, "");
  const t = convexTest(schema, modules);
  const result = await t.action(api.auth.signIn, { provider: "password", params: { ...params, flow: "signUp" } });
  expect(result.tokens).toBeTruthy();
  expect(fetchMock).not.toHaveBeenCalled();
  expect((await t.run(ctx => ctx.db.query("users").first()))?.emailVerificationTime).toBeUndefined();
  expect((await t.action(api.auth.signIn, { provider: "password", params: { ...params, flow: "signIn" } })).tokens).toBeTruthy();
});
