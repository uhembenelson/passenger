import { ConvexError } from "convex/values";

/* Branded Passenger email templates.
 * Mirrors packages/email-templates/templates/base.html (same shell, tokens
 * and tone) so every customer-facing email shares one visual identity:
 * Work Sans, the brand green #34D186 as the single accent, monochrome base,
 * one primary action, no emojis, calm plain-language copy.
 */

function escapeHtmlAttribute(value: string) {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const LOGO_DATA_URI = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='1024' height='1024' viewBox='0 0 1024 1024'%3E%3Crect width='1024' height='1024' rx='224' fill='%23183E32'/%3E%3Cpath d='M302 702 701 303M338 303h363v363' fill='none' stroke='%23D8ED93' stroke-width='88' stroke-linecap='round' stroke-linejoin='round'/%3E%3Ccircle cx='302' cy='702' r='59' fill='%23D8ED93'/%3E%3C/svg%3E";

function emailShell({ microLabel, headline, bodyHtml, cardHtml, ctaHref, ctaLabel, noteHtml, footerReason = "You are receiving this because you use Passenger." }: {
  microLabel: string;
  headline: string;
  bodyHtml: string;
  cardHtml: string;
  ctaHref: string;
  ctaLabel: string;
  noteHtml: string;
  footerReason?: string;
}) {
  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<meta name="x-apple-disable-message-reformatting">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Work+Sans:wght@400;500;600&display=swap" rel="stylesheet">
<style>
@media only screen and (max-width: 600px) {
  .container { width: 100% !important; min-width: 100% !important; }
  .mobile-px { padding-left: 20px !important; padding-right: 20px !important; }
  .pad { padding-left: 20px !important; padding-right: 20px !important; }
  .mobile-pt { padding-top: 32px !important; }
  .mobile-pb { padding-bottom: 40px !important; }
  .mobile-hero-pt { padding-top: 40px !important; }
  .mobile-body { font-size: 16px !important; line-height: 1.8 !important; }
  .mobile-h1 { font-size: 24px !important; line-height: 1.25 !important; }
  .mobile-btn { width: 100% !important; }
  .mobile-btn a { display: block !important; width: 100% !important; padding: 16px 20px !important; text-align: center !important; }
}
</style>
</head>
<body style="margin:0; padding:0; background-color:#F7F7F8; -webkit-text-size-adjust:100%; word-spacing:normal;">
<!--[if mso]>
<table role="presentation" align="center" border="0" cellspacing="0" cellpadding="0" width="600"><tr><td width="600">
<![endif]-->
<table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" bgcolor="#F7F7F8">
  <tr>
    <td align="center" class="mobile-px" style="padding:24px 16px 40px 16px;">
      <table role="presentation" class="container" width="600" border="0" cellspacing="0" cellpadding="0"
             style="width:600px; max-width:600px; background-color:#FFFFFF; border-radius:12px; overflow:hidden; margin:0 auto;">
        <tr>
          <td class="pad mobile-pt" style="padding:40px 56px 0 56px;" align="left">
            <table role="presentation" border="0" cellspacing="0" cellpadding="0">
              <tr>
                <td style="vertical-align:middle; font-size:0; line-height:0;">
                  <img src="${LOGO_DATA_URI}" width="36" height="36" alt=""
                       style="display:block; width:36px; height:36px; border:0;"
                       data-replace="https://assets.passenger.ng/emails/logo-256.png">
                </td>
                <td style="vertical-align:middle; padding-left:12px;">
                  <span style="font-family:'Work Sans','Helvetica Neue',Helvetica,Arial,sans-serif; font-size:20px; font-weight:600; letter-spacing:-0.01em; color:#2D362F;">Passenger</span>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td class="pad mobile-hero-pt" style="padding:48px 56px 0 56px;" align="left">
            <p style="margin:0 0 16px 0; font-family:'Work Sans','Helvetica Neue',Helvetica,Arial,sans-serif; font-size:12px; font-weight:600; letter-spacing:0.14em; text-transform:uppercase; color:#248A56;">${microLabel}</p>
            <h1 class="mobile-h1" style="margin:0 0 20px 0; font-family:'Work Sans','Helvetica Neue',Helvetica,Arial,sans-serif; font-size:28px; font-weight:600; line-height:1.25; letter-spacing:-0.015em; color:#2D362F;">${headline}</h1>
            <div class="mobile-body" style="font-family:'Work Sans','Helvetica Neue',Helvetica,Arial,sans-serif; font-size:17px; font-weight:400; line-height:1.75; color:#4B5563;">
              ${bodyHtml}
            </div>
          </td>
        </tr>
        ${cardHtml}
        <tr>
          <td class="pad" style="padding:40px 56px 0 56px;" align="left">
            <table role="presentation" class="mobile-btn" border="0" cellspacing="0" cellpadding="0" width="100%">
              <tr>
                <td align="left">
                  <table role="presentation" border="0" cellspacing="0" cellpadding="0">
                    <tr>
                      <td align="center" bgcolor="#34D186" style="border-radius:999px;">
                        <a href="${ctaHref}" target="_blank"
                           style="display:inline-block; padding:16px 32px; font-family:'Work Sans','Helvetica Neue',Helvetica,Arial,sans-serif; font-size:16px; font-weight:600; line-height:1; color:#FFFFFF; background-color:#34D186; border-radius:999px; text-decoration:none; mso-padding-alt:0px;">
                          ${ctaLabel}
                        </a>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
            <p style="margin:16px 0 0 0; font-family:'Work Sans','Helvetica Neue',Helvetica,Arial,sans-serif; font-size:13px; font-weight:400; line-height:1.6; color:#7A7F87;">${noteHtml}</p>
          </td>
        </tr>
        <tr>
          <td class="pad mobile-pb" style="padding:56px 56px 40px 56px;" align="left">
            <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="width:100%; border-top:1px solid #E5E7EB;">
              <tr>
                <td style="padding:32px 0 0 0;">
                  <p style="margin:0; font-family:'Work Sans','Helvetica Neue',Helvetica,Arial,sans-serif; font-size:12px; font-weight:600; letter-spacing:0.02em; text-transform:uppercase; color:#4B5563;">Passenger</p>
                  <p style="margin:6px 0 0 0; font-family:'Work Sans','Helvetica Neue',Helvetica,Arial,sans-serif; font-size:13px; font-weight:400; color:#7A7F87;">Good things move with people.</p>
                  <p style="margin:16px 0 0 0; font-family:'Work Sans','Helvetica Neue',Helvetica,Arial,sans-serif; font-size:13px; font-weight:400; color:#7A7F87; line-height:1.7;">
                    <a href="https://usepassenger.com/help" style="color:#4B5563; text-decoration:none;">Help centre</a>
                    &nbsp;·&nbsp;
                    <a href="https://usepassenger.com/privacy" style="color:#4B5563; text-decoration:none;">Privacy</a>
                  </p>
                  <p style="margin:16px 0 0 0; font-family:'Work Sans','Helvetica Neue',Helvetica,Arial,sans-serif; font-size:12px; font-weight:400; color:#9CA3AF; line-height:1.6;">
                    ${escapeHtmlAttribute(footerReason)}<br>
                    Passenger, Jos, Plateau State, Nigeria.
                  </p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
<!--[if mso]>
</td></tr></table>
<![endif]-->
</body>
</html>`;
}

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
