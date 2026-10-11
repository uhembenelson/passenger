import { ConvexError } from "convex/values";
import { emailShell, escapeHtmlAttribute } from "@passenger/core";

/* Branded Passenger email templates.
 * Mirrors packages/email-templates/templates/base.html (same shell, tokens
 * and tone) so every customer-facing email shares one visual identity:
 * Work Sans, the brand green #34D186 as the single accent, monochrome base,
 * one primary action, no emojis, calm plain-language copy.
 *
 * The shared shell and HTML escaper live in @passenger/core so the admin
 * template builder can preview the exact markup that gets sent.
 */

export function renderResetPasswordEmail(args: { email: string; resetUrl: string; code: string }): { html: string; text: string } {
  const href = escapeHtmlAttribute(args.resetUrl);
  const html = emailShell({
    microLabel: "Password reset",
    headline: "Reset your Passenger password.",
    bodyHtml: `<p style="margin:0; font-family:'Work Sans','Helvetica Neue',Helvetica,Arial,sans-serif; font-size:17px; font-weight:400; line-height:1.7; color:#4B5563;">
      We received a request to change the password for <strong style="color:#2D362F;">${escapeHtmlAttribute(args.email)}</strong>.<br>
      The link below is valid for 10 minutes. If this was not you, you can ignore this email.
    </p>`,
    cardHtml: `<tr>
      <td class="pad" style="padding:48px 56px 0 56px;" align="left">
        <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0"
               style="width:100%; border:1px solid #E5E7EB; border-radius:12px; background-color:#FFFFFF;">
          <tr>
            <td style="padding:20px 24px 12px 24px; border-bottom:1px solid #F0F1F4;">
              <span style="font-family:'Work Sans','Helvetica Neue',Helvetica,Arial,sans-serif; font-size:16px; font-weight:600; color:#2D362F;">Your reset code</span>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 24px 20px 24px;">
              <p style="margin:0 0 4px 0; font-family:'Work Sans','Helvetica Neue',Helvetica,Arial,sans-serif; font-size:14px; font-weight:400; color:#7A7F87;">Enter this code on the reset screen if the link does not open.</p>
              <p style="margin:0; font-family:'Work Sans','Helvetica Neue',Helvetica,Arial,sans-serif; font-size:18px; font-weight:600; letter-spacing:0.06em; color:#248A56;">${escapeHtmlAttribute(args.code)}</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>`,
    ctaHref: href,
    ctaLabel: "Reset your password",
    noteHtml: "The link and code expire in 10 minutes. You can request a new one at any time.",
  });
  const text = [
    "Reset your Passenger password.",
    "",
    `We received a request to change the password for ${args.email}.`,
    "",
    `Open this link within 10 minutes: ${args.resetUrl}`,
    "",
    `If you need the code directly, use ${args.code}.`,
    "",
    "If this was not you, you can ignore this email.",
  ].join("\n");
  return { html, text };
}

export function renderVerificationEmail(args: { email: string; appUrl: string; code: string }): { html: string; text: string } {
  return {
    html: emailShell({
      microLabel: "Email verification",
      headline: "Verify your email address.",
      bodyHtml: `<p style="font-family:Arial,sans-serif; font-size:17px; line-height:1.7; color:#4B5563;">Enter this code in Passenger to verify ${escapeHtmlAttribute(args.email)}.</p>`,
      cardHtml: `<tr><td class="pad" style="padding:32px 56px 0;"><p style="font-family:monospace; font-size:18px; line-height:1.6; overflow-wrap:anywhere; word-break:break-all; color:#248A56;">${escapeHtmlAttribute(args.code)}</p></td></tr>`,
      ctaHref: escapeHtmlAttribute(args.appUrl),
      ctaLabel: "Open Passenger",
      noteHtml: "Your code expires in 10 minutes. If you did not request this email, you can ignore it.",
    }),
    text: `Verify your email address.\n\nEnter this code in Passenger for ${args.email}:\n${args.code}\n\nThe code expires in 10 minutes.\nOpen Passenger: ${args.appUrl}\n\nIf you did not request this email, you can ignore it.`,
  };
}

export function renderTransactionPinCodeEmail(args: { name: string; appUrl: string; code: string }): { html: string; text: string } {
  return {
    html: emailShell({
      microLabel: "Transaction PIN security",
      headline: "Confirm your PIN change.",
      bodyHtml: `<p style="margin:0; font-family:'Work Sans','Helvetica Neue',Helvetica,Arial,sans-serif; font-size:17px; font-weight:400; line-height:1.7; color:#4B5563;">Hello ${escapeHtmlAttribute(args.name)},<br><br>Enter this single-use code in Passenger before changing or resetting your transaction PIN.</p>`,
      cardHtml: `<tr><td class="pad" style="padding:32px 56px 0;"><p style="margin:0; font-family:monospace; font-size:28px; font-weight:600; letter-spacing:0.18em; color:#248A56;">${escapeHtmlAttribute(args.code)}</p></td></tr>`,
      ctaHref: escapeHtmlAttribute(args.appUrl),
      ctaLabel: "Open Passenger",
      noteHtml: "This code expires in 10 minutes. If you did not request it, do not share the code and contact Passenger support.",
    }),
    text: `Hello ${args.name},\n\nUse this code to change or reset your Passenger transaction PIN:\n${args.code}\n\nThe code expires in 10 minutes and can be used once.\n\nOpen Passenger: ${args.appUrl}\n\nIf you did not request this, do not share the code and contact Passenger support.`,
  };
}

export function renderNotificationEmail(args: { name: string; title: string; body: string; appUrl: string; reference?: string }): { html: string; text: string } {
  const detail = args.reference ? `${args.body} Reference: ${args.reference}.` : args.body;
  return {
    html: emailShell({
      microLabel: "Account update",
      headline: escapeHtmlAttribute(args.title),
      bodyHtml: `<p style="margin:0; font-family:'Work Sans','Helvetica Neue',Helvetica,Arial,sans-serif; font-size:17px; font-weight:400; line-height:1.7; color:#4B5563;">Hello ${escapeHtmlAttribute(args.name)},<br><br>${escapeHtmlAttribute(detail)}</p>`,
      cardHtml: "",
      ctaHref: escapeHtmlAttribute(args.appUrl),
      ctaLabel: "Open Passenger",
      noteHtml: "This is an important transactional update about your Passenger account or delivery.",
    }),
    text: `Hello ${args.name},\n\n${args.title}\n\n${detail}\n\nOpen Passenger: ${args.appUrl}`,
  };
}

export function renderWaitlistEmail(args: { name: string; state: string; siteUrl: string }): { html: string; text: string } {
  const firstName = args.name.trim().split(/\s+/)[0] || "there";
  const htmlBody = `<p style="margin:0 0 24px 0; font-family:'Work Sans','Helvetica Neue',Helvetica,Arial,sans-serif; font-size:17px; font-weight:400; line-height:1.7; color:#4B5563;">Hi ${escapeHtmlAttribute(firstName)},</p>
    <p style="margin:0 0 24px 0; font-family:'Work Sans','Helvetica Neue',Helvetica,Arial,sans-serif; font-size:17px; font-weight:400; line-height:1.7; color:#4B5563;">Thank you for joining the Passenger waitlist.</p>
    <p style="margin:0 0 24px 0; font-family:'Work Sans','Helvetica Neue',Helvetica,Arial,sans-serif; font-size:17px; font-weight:400; line-height:1.7; color:#4B5563;">Passenger is being built around a simple everyday problem. Someone needs to send a package from one city to another, while someone else is already travelling along that same route.</p>
    <p style="margin:0 0 24px 0; font-family:'Work Sans','Helvetica Neue',Helvetica,Arial,sans-serif; font-size:17px; font-weight:400; line-height:1.7; color:#4B5563;">Most of the time, those two people never find each other. People still depend on friends, WhatsApp updates, transport parks, or whatever option is available at the time.</p>
    <p style="margin:0 0 24px 0; font-family:'Work Sans','Helvetica Neue',Helvetica,Arial,sans-serif; font-size:17px; font-weight:400; line-height:1.7; color:#4B5563;">Passenger is being built to make that process easier.</p>
    <p style="margin:0 0 24px 0; font-family:'Work Sans','Helvetica Neue',Helvetica,Arial,sans-serif; font-size:17px; font-weight:400; line-height:1.7; color:#4B5563;">If you need to send something, you will be able to find a traveller already going in that direction. If you are travelling, you will be able to earn from a journey you were already making.</p>
    <p style="margin:0 0 24px 0; font-family:'Work Sans','Helvetica Neue',Helvetica,Arial,sans-serif; font-size:17px; font-weight:400; line-height:1.7; color:#4B5563;">We are currently preparing the first version of Passenger and working through the areas that matter most, including identity verification, payments, package handoff, delivery confirmation, and user safety.</p>
    <p style="margin:0 0 24px 0; font-family:'Work Sans','Helvetica Neue',Helvetica,Arial,sans-serif; font-size:17px; font-weight:400; line-height:1.7; color:#4B5563;">Because you joined the waitlist, you will be among the first people to hear from us when Passenger begins opening to users. You will also receive important updates as we get closer to launch.</p>
    <p style="margin:0 0 24px 0; font-family:'Work Sans','Helvetica Neue',Helvetica,Arial,sans-serif; font-size:17px; font-weight:400; line-height:1.7; color:#4B5563;">You do not need to do anything else at the moment. We will contact you when early access becomes available.</p>
    <p style="margin:0 0 24px 0; font-family:'Work Sans','Helvetica Neue',Helvetica,Arial,sans-serif; font-size:17px; font-weight:400; line-height:1.7; color:#4B5563;">We appreciate you being here this early.</p>
    <p style="margin:0; font-family:'Work Sans','Helvetica Neue',Helvetica,Arial,sans-serif; font-size:17px; font-weight:400; line-height:1.7; color:#4B5563;">
      Passenger<br>
      Send it with someone already going your way.
    </p>`;

  const text = `Hi ${firstName},

Thank you for joining the Passenger waitlist.

Passenger is being built around a simple everyday problem. Someone needs to send a package from one city to another, while someone else is already travelling along that same route.

Most of the time, those two people never find each other. People still depend on friends, WhatsApp updates, transport parks, or whatever option is available at the time.

Passenger is being built to make that process easier.

If you need to send something, you will be able to find a traveller already going in that direction. If you are travelling, you will be able to earn from a journey you were already making.

We are currently preparing the first version of Passenger and working through the areas that matter most, including identity verification, payments, package handoff, delivery confirmation, and user safety.

Because you joined the waitlist, you will be among the first people to hear from us when Passenger begins opening to users. You will also receive important updates as we get closer to launch.

You do not need to do anything else at the moment. We will contact you when early access becomes available.

We appreciate you being here this early.

Passenger
Send it with someone already going your way.`;

  return {
    html: emailShell({
      microLabel: "Waitlist confirmed",
      headline: "You are on the Passenger waitlist",
      bodyHtml: `<div style="margin:0;">${htmlBody}</div>`,
      cardHtml: "",
      ctaHref: escapeHtmlAttribute(args.siteUrl),
      ctaLabel: "Visit Passenger",
      noteHtml: "We will contact you when early access becomes available.",
      footerReason: "You are receiving this because you joined the Passenger waitlist.",
    }),
    text,
  };
}

export async function sendBrandedEmail(args: { to: string; subject: string; html: string; text?: string }): Promise<{ id: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.AUTH_EMAIL_FROM;
  if (!apiKey || !from) {
    throw new ConvexError("Email sending is not configured yet. Set RESEND_API_KEY and AUTH_EMAIL_FROM on the backend deployment.");
  }

  const payload: { from: string; to: string; subject: string; html: string; text?: string } = {
    from,
    to: args.to,
    subject: args.subject,
    html: args.html,
    ...(args.text ? { text: args.text } : {}),
  };
  let response: Response;
  try {
    response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new ConvexError("We could not connect to the email provider. Please check your connection and try again.");
  }
  const result = await response.json().catch(() => null) as { id?: string; message?: string } | null;
  if (!response.ok || typeof result?.id !== "string" || !result.id) {
    throw new ConvexError(result?.message ?? "Passenger could not send the email. Check the email provider configuration and try again.");
  }
  return { id: result.id };
}
