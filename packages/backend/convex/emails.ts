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

function emailShell({ microLabel, headline, bodyHtml, cardHtml, ctaHref, ctaLabel, noteHtml }: {
  microLabel: string;
  headline: string;
  bodyHtml: string;
  cardHtml: string;
  ctaHref: string;
  ctaLabel: string;
  noteHtml: string;
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
  .container { width: 100% !important; }
  .pad { padding-left: 32px !important; padding-right: 32px !important; }
}
</style>
</head>
<body style="margin:0; padding:0; background-color:#F7F7F8; -webkit-text-size-adjust:100%; word-spacing:normal;">
<!--[if mso]>
<table role="presentation" align="center" border="0" cellspacing="0" cellpadding="0" width="600"><tr><td width="600">
<![endif]-->
<table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" bgcolor="#F7F7F8">
  <tr>
    <td align="center" style="padding:48px 24px 64px 24px;">
      <table role="presentation" class="container" width="600" border="0" cellspacing="0" cellpadding="0"
             style="width:600px; max-width:600px; background-color:#FFFFFF; border-radius:16px; overflow:hidden;">
        <tr>
          <td class="pad" style="padding:40px 56px 0 56px;" align="left">
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
          <td class="pad" style="padding:56px 56px 0 56px;" align="left">
            <p style="margin:0 0 20px 0; font-family:'Work Sans','Helvetica Neue',Helvetica,Arial,sans-serif; font-size:12px; font-weight:600; letter-spacing:0.14em; text-transform:uppercase; color:#248A56;">${microLabel}</p>
            <h1 style="margin:0 0 20px 0; font-family:'Work Sans','Helvetica Neue',Helvetica,Arial,sans-serif; font-size:30px; font-weight:600; line-height:1.35; letter-spacing:-0.015em; color:#2D362F;">${headline}</h1>
            ${bodyHtml}
          </td>
        </tr>
        ${cardHtml}
        <tr>
          <td class="pad" style="padding:48px 56px 0 56px;" align="left">
            <table role="presentation" border="0" cellspacing="0" cellpadding="0">
              <tr>
                <td align="center" bgcolor="#34D186" style="border-radius:999px;">
                  <a href="${ctaHref}" target="_blank"
                     style="display:inline-block; padding:16px 40px; font-family:'Work Sans','Helvetica Neue',Helvetica,Arial,sans-serif; font-size:16px; font-weight:600; line-height:1; color:#FFFFFF; background-color:#34D186; border-radius:999px; text-decoration:none; mso-padding-alt:0px;">
                    ${ctaLabel}
                  </a>
                </td>
              </tr>
            </table>
            <p style="margin:20px 0 0 0; font-family:'Work Sans','Helvetica Neue',Helvetica,Arial,sans-serif; font-size:13px; font-weight:400; line-height:1.6; color:#7A7F87;">${noteHtml}</p>
          </td>
        </tr>
        <tr>
          <td style="padding:64px 56px 0 56px;" align="left">
            <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="width:100%; border-top:1px solid #E5E7EB;">
              <tr>
                <td style="padding:32px 0 40px 0;">
                  <p style="margin:0; font-family:'Work Sans','Helvetica Neue',Helvetica,Arial,sans-serif; font-size:12px; font-weight:600; letter-spacing:0.02em; text-transform:uppercase; color:#4B5563;">Passenger</p>
                  <p style="margin:6px 0 0 0; font-family:'Work Sans','Helvetica Neue',Helvetica,Arial,sans-serif; font-size:13px; font-weight:400; color:#7A7F87;">Good things move with people.</p>
                  <p style="margin:20px 0 0 0; font-family:'Work Sans','Helvetica Neue',Helvetica,Arial,sans-serif; font-size:13px; font-weight:400; color:#7A7F87; line-height:1.8;">
                    <a href="https://passenger.ng/help" style="color:#4B5563; text-decoration:none;">Help centre</a>
                    &nbsp;·&nbsp;
                    <a href="https://passenger.ng/privacy" style="color:#4B5563; text-decoration:none;">Privacy</a>
                  </p>
                  <p style="margin:20px 0 0 0; font-family:'Work Sans','Helvetica Neue',Helvetica,Arial,sans-serif; font-size:12px; font-weight:400; color:#9CA3AF; line-height:1.6;">
                    You are receiving this because you use Passenger.<br>
                    Passenger, 12 Awolowo Road, Ikoyi, Lagos, Nigeria.
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
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(15_000),
  });
  const result = await response.json().catch(() => null) as { id?: string; message?: string } | null;
  if (!response.ok || !result?.id) {
    throw new ConvexError(result?.message ?? "Passenger could not send the email. Check the email provider configuration and try again.");
  }
  return { id: result.id };
}