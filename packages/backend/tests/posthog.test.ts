import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { capturePostHogEvent, postHogDistinctId } from "../convex/posthog";

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubEnv("POSTHOG_PROJECT_API_KEY", "phc_project_token");
  vi.stubEnv("POSTHOG_HOST", "https://eu.i.posthog.com");
  fetchMock.mockReset().mockResolvedValue(new Response(JSON.stringify({ status: "ok" })));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

it("captures an anonymous event through the PostHog HTTP API", async () => {
  const distinctId = await postHogDistinctId(" Ada@Example.com ");
  await expect(capturePostHogEvent({
    distinctId,
    event: "waitlist_joined",
    properties: { state: "Lagos", confirmation_sent: true },
  })).resolves.toBe(true);

  expect(fetchMock).toHaveBeenCalledTimes(1);
  const [url, request] = fetchMock.mock.calls[0];
  expect(url).toBe("https://eu.i.posthog.com/i/v0/e/");
  const payload = JSON.parse(request.body);
  expect(payload.token).toBe("phc_project_token");
  expect(payload.event).toBe("waitlist_joined");
  expect(payload.properties).toMatchObject({
    distinct_id: distinctId,
    $process_person_profile: false,
    source: "passenger_convex",
    state: "Lagos",
  });
  expect(JSON.stringify(payload)).not.toContain("ada@example.com");
});

it("does nothing when the server configuration is absent or unsafe", async () => {
  vi.stubEnv("POSTHOG_PROJECT_API_KEY", "");
  await expect(capturePostHogEvent({ distinctId: "anon", event: "test" })).resolves.toBe(false);
  vi.stubEnv("POSTHOG_PROJECT_API_KEY", "phc_project_token");
  vi.stubEnv("POSTHOG_HOST", "https://example.com");
  await expect(capturePostHogEvent({ distinctId: "anon", event: "test" })).resolves.toBe(false);
  expect(fetchMock).not.toHaveBeenCalled();
});

it("does not break the product flow when PostHog rejects an event", async () => {
  fetchMock.mockResolvedValue(new Response("bad request", { status: 400 }));
  await expect(capturePostHogEvent({ distinctId: "anon", event: "test" })).resolves.toBe(false);
});
