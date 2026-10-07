/// <reference types="vite/client" />
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "../convex/schema";
import { api } from "../convex/_generated/api";

const modules = import.meta.glob("../convex/**/*.ts");
const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubEnv("RESEND_API_KEY", "re_test");
  vi.stubEnv("AUTH_EMAIL_FROM", "Passenger <accounts@usepassenger.com>");
  vi.stubEnv("SITE_URL", "https://usepassenger.com");
  fetchMock.mockReset().mockResolvedValue(new Response(JSON.stringify({ id: "email_waitlist_1" })));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

it("stores a normalized signup and sends one confirmation email", async () => {
  const t = convexTest(schema, modules);
  await expect(t.action(api.waitlist.join, {
    name: "  Ada   Okafor  ",
    email: " ADA@Example.com ",
    state: "Lagos",
  })).resolves.toEqual({ joined: true, confirmationSent: true });

  const signup = await t.run(ctx => ctx.db.query("waitlistSignups").unique());
  expect(signup).toMatchObject({
    name: "Ada Okafor",
    email: "ada@example.com",
    state: "Lagos",
    confirmationStatus: "sent",
    confirmationEmailId: "email_waitlist_1",
  });
  const payload = JSON.parse(fetchMock.mock.calls[0][1].body);
  expect(payload.from).toBe("Passenger <accounts@usepassenger.com>");
  expect(payload.to).toBe("ada@example.com");
  expect(payload.subject).toBe("Welcome to the Passenger waitlist");
  expect(payload.text).toContain("Thanks for joining us from Lagos");

  await t.action(api.waitlist.join, { name: "Ada Okafor", email: "ada@example.com", state: "Ogun" });
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(await t.run(ctx => ctx.db.query("waitlistSignups").collect())).toHaveLength(1);
});

it("records a failed confirmation and permits a later retry", async () => {
  const t = convexTest(schema, modules);
  fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ message: "Sending domain is not verified" }), { status: 403 }));
  const args = { name: "Ada Okafor", email: "ada@example.com", state: "Lagos" };

  await expect(t.action(api.waitlist.join, args)).rejects.toThrow("domain is not verified");
  expect(await t.run(ctx => ctx.db.query("waitlistSignups").unique())).toMatchObject({ confirmationStatus: "failed" });

  fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ id: "email_waitlist_2" })));
  await expect(t.action(api.waitlist.join, args)).resolves.toEqual({ joined: true, confirmationSent: true });
  expect(await t.run(ctx => ctx.db.query("waitlistSignups").unique())).toMatchObject({
    confirmationStatus: "sent",
    confirmationEmailId: "email_waitlist_2",
  });
});

it("rejects malformed public submissions", async () => {
  const t = convexTest(schema, modules);
  await expect(t.action(api.waitlist.join, { name: "A", email: "not-an-email", state: "Somewhere" })).rejects.toThrow();
  expect(fetchMock).not.toHaveBeenCalled();
  expect(await t.run(ctx => ctx.db.query("waitlistSignups").collect())).toEqual([]);
});
