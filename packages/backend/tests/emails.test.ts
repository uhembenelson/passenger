import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderResetPasswordEmail, renderVerificationEmail, sendBrandedEmail } from "../convex/emails";

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.unstubAllEnvs();
  vi.stubEnv("RESEND_API_KEY", "re_testkey");
  vi.stubEnv("AUTH_EMAIL_FROM", "transactions@passenger.test");
  vi.stubGlobal("fetch", fetchMock);
});

describe("password reset email", () => {
  it("renders the branded template with the reset details", () => {
    const { html, text } = renderResetPasswordEmail({
      email: "ada@example.com",
      resetUrl: "https://app.passenger.ng/reset?a=1&b=2",
      code: "482913",
    });

    expect(html).toContain("Reset your Passenger password.");
    expect(html).toContain("https://app.passenger.ng/reset?a=1&amp;b=2");
    expect(html).toContain("482913");
    expect(html).toContain("Work Sans");
    expect(html).toContain("#34D186");
    expect(html).toContain("Good things move with people.");
    expect(html).not.toContain("🚀");
    expect(text).toContain("482913");
    expect(text).toContain("https://app.passenger.ng/reset?a=1&b=2");
  });

  it("sends the html and text variants through Resend", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ id: "email_123" }),
    });

    const { html, text } = renderResetPasswordEmail({
      email: "ada@example.com",
      resetUrl: "https://app.passenger.ng/reset",
      code: "482913",
    });
    const result = await sendBrandedEmail({ to: "ada@example.com", subject: "Reset your Passenger password", html, text });

    expect(result).toEqual({ id: "email_123" });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.resend.com/emails");
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe("Bearer re_testkey");
    const body = JSON.parse(init.body);
    expect(body.from).toBe("transactions@passenger.test");
    expect(body.to).toBe("ada@example.com");
    expect(body.subject).toBe("Reset your Passenger password");
    expect(body.html).toContain("Reset your Passenger password.");
    expect(body.text).toContain("Reset your Passenger password.");
  });

  it("fails closed when Resend is not configured", async () => {
    vi.stubEnv("RESEND_API_KEY", undefined);
    await expect(
      sendBrandedEmail({ to: "ada@example.com", subject: "s", html: "<p>hi</p>" }),
    ).rejects.toThrow(/not configured/);
  });

  it("surfaces provider errors instead of swallowing them", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 422,
      json: async () => ({ message: "You can only send testing emails to your own email address" }),
    });
    const { html } = renderResetPasswordEmail({ email: "ada@example.com", resetUrl: "https://x", code: "1" });
    await expect(
      sendBrandedEmail({ to: "ada@example.com", subject: "s", html }),
    ).rejects.toThrow(/own email address/);
  });
});
  it("rejects network failures and malformed success responses", async () => {
    fetchMock.mockRejectedValueOnce(new Error("timeout"));
    await expect(sendBrandedEmail({ to: "ada@example.com", subject: "Reset", html: "<p>Reset</p>" })).rejects.toThrow("could not connect");
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ id: 123 }) });
    await expect(sendBrandedEmail({ to: "ada@example.com", subject: "Reset", html: "<p>Reset</p>" })).rejects.toThrow("could not send");
  });

it("renders signup verification with escaped recipient details and the code", () => {
  const { html, text } = renderVerificationEmail({ email: "<ada>@example.com", appUrl: "https://app.example.com/?a=1&b=2", code: "verification-token" });
  expect(html).toContain("Verify your email address.");
  expect(html).toContain("&lt;ada&gt;@example.com");
  expect(html).toContain("a=1&amp;b=2");
  expect(html).toContain("verification-token");
  expect(text).toContain("expires in 10 minutes");
});
