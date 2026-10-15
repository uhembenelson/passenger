const POSTHOG_CLOUD_HOSTS = new Set([
  "https://eu.i.posthog.com",
  "https://us.i.posthog.com",
]);

type PostHogProperty = string | number | boolean | null;

export async function postHogDistinctId(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value.trim().toLowerCase());
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}

export async function capturePostHogEvent(args: {
  distinctId: string;
  event: string;
  properties?: Record<string, PostHogProperty>;
}): Promise<boolean> {
  const token = process.env.POSTHOG_PROJECT_API_KEY?.trim();
  const host = process.env.POSTHOG_HOST?.trim().replace(/\/$/, "");
  if (!token || !host) return false;
  if (!token.startsWith("phc_") || !POSTHOG_CLOUD_HOSTS.has(host)) {
    console.error("PostHog capture is not configured with a valid project token and cloud host.");
    return false;
  }

  try {
    const response = await fetch(`${host}/i/v0/e/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token,
        event: args.event,
        properties: {
          distinct_id: args.distinctId,
          $process_person_profile: false,
          source: "passenger_convex",
          ...args.properties,
        },
      }),
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) {
      console.error("PostHog rejected an analytics event", args.event, response.status);
      return false;
    }
    return true;
  } catch (error) {
    console.error("PostHog analytics delivery failed", args.event, error instanceof Error ? error.message : "Unknown error");
    return false;
  }
}
