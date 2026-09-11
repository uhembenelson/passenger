import { Email } from "@convex-dev/auth/providers/Email";
import { Password } from "@convex-dev/auth/providers/Password";
import { convexAuth } from "@convex-dev/auth/server";
import { ConvexError } from "convex/values";
import { normalizePhone } from "@passenger/core";
import type { DataModel } from "./_generated/dataModel";
import { renderResetPasswordEmail, sendBrandedEmail } from "./emails";

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

const PassengerPassword = Password<DataModel>({
  reset: PassengerResetEmail as any,
  profile(params) {
    const flow = String(params.flow ?? "");
    const email = String(params.email ?? "").trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ConvexError("Enter a valid email address.");

    if (flow !== "signUp") {
      return { email, subject: email, name: "Passenger member", phone: "+2340000000000", verification: "required" as const, joinedAt: Date.now() };
    }

    const name = String(params.name ?? "").trim();
    if (!name || name.length > 120) throw new ConvexError("Name must be 1–120 characters.");
    let phone: string;
    try { phone = normalizePhone(String(params.phone ?? "")); }
    catch { throw new ConvexError("Enter a valid phone number."); }
    return { email, subject: email, name, phone, verification: "required" as const, joinedAt: Date.now() };
  },
  validatePasswordRequirements(password) {
    if (password.length < 10 || !/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password)) {
      throw new ConvexError("Use at least 10 characters with uppercase, lowercase, and a number.");
    }
  },
});

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({ providers: [PassengerPassword] });
