import { Email } from "@convex-dev/auth/providers/Email";
import { Password } from "@convex-dev/auth/providers/Password";
import { convexAuth } from "@convex-dev/auth/server";
import { ConvexError } from "convex/values";
import type { DataModel } from "./_generated/dataModel";
import { renderResetPasswordEmail, renderVerificationEmail, sendBrandedEmail } from "./emails";

const PassengerResetEmail = Email<DataModel>({
  id: "password-reset",
  maxAge: 10 * 60,
  async sendVerificationRequest({ identifier, token, url }: { identifier: string; token: string; url: string }) {
    const resetUrl = new URL(url);
    resetUrl.searchParams.delete("code");
    resetUrl.searchParams.set("reset_code", token);
    resetUrl.searchParams.set("reset_email", identifier);

    const { html, text } = renderResetPasswordEmail({
      email: identifier,
      resetUrl: resetUrl.toString(),
      code: token,
    });
    await sendBrandedEmail({
      to: identifier,
      subject: "Reset your Passenger password",
      html,
      text,
    });
  },
});

const PassengerVerificationEmail = Email<DataModel>({
  id: "email-verification",
  maxAge: 10 * 60,
  async sendVerificationRequest({ identifier, token, url }) {
    // Use code entry so verification works across mobile and web without a deep link.
    const appUrl = new URL(url);
    appUrl.searchParams.delete("code");
    const { html, text } = renderVerificationEmail({ email: identifier, code: token, appUrl: appUrl.toString() });
    await sendBrandedEmail({ to: identifier, subject: "Verify your Passenger email", html, text });
  },
});

const PassengerPassword = Password<DataModel>({
  reset: PassengerResetEmail as any,
  verify: process.env.RESEND_API_KEY && process.env.AUTH_EMAIL_FROM ? PassengerVerificationEmail as any : undefined,
  profile(params) {
    const flow = String(params.flow ?? "");
    const email = String(params.email ?? "").trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ConvexError("Enter a valid email address.");

    if (flow !== "signUp") {
      return { email, subject: email, name: "Passenger member", phone: "+2340000000000", verification: "required" as const, joinedAt: Date.now() };
    }

    const name = email.split("@")[0]!.replace(/[._-]+/g, " ").trim().slice(0, 120) || "Passenger member";
    return { email, subject: email, name, phone: "+2340000000000", verification: "required" as const, joinedAt: Date.now() };
  },
  validatePasswordRequirements(password) {
    if (password.length < 10 || !/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password)) {
      throw new ConvexError("Use at least 10 characters with uppercase, lowercase, and a number.");
    }
  },
});

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({ providers: [PassengerPassword] });
