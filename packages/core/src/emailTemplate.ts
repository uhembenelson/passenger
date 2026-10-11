/* Shared Passenger email document builder.
 *
 * This module owns the single branded email shell plus the renderer for
 * admin-built templates. It is imported by both the Convex backend (which
 * sends mail through Resend) and the admin app (which previews the exact same
 * HTML in the template builder), so a preview can never drift from what is
 * delivered.
 *
 * Brand rules: Work Sans throughout, the brand green #34D186 as the single
 * accent, monochrome base, no emojis, calm plain-language copy.
 */

export type EmailAlign = "left" | "center" | "right";
export type EmailHeadingLevel = "h1" | "h2" | "h3";
export type EmailImageWidth = "small" | "medium" | "large" | "full";
export type EmailButtonVariant = "primary" | "secondary";
export type EmailSpacerSize = "small" | "medium" | "large";

export interface EmailHeadingBlock {
  id: string;
  type: "heading";
  text: string;
  align: EmailAlign;
  level: EmailHeadingLevel;
}
export interface EmailParagraphBlock {
  id: string;
  type: "paragraph";
  text: string;
  align: EmailAlign;
}
export interface EmailImageBlock {
  id: string;
  type: "image";
  url: string;
  alt: string;
  href?: string;
  width: EmailImageWidth;
  align: EmailAlign;
}
export interface EmailButtonBlock {
  id: string;
  type: "button";
  label: string;
  href: string;
  align: EmailAlign;
  variant: EmailButtonVariant;
}
export interface EmailDividerBlock {
  id: string;
  type: "divider";
}
export interface EmailSpacerBlock {
  id: string;
  type: "spacer";
  size: EmailSpacerSize;
}
export type EmailBlock =
  | EmailHeadingBlock
  | EmailParagraphBlock
  | EmailImageBlock
  | EmailButtonBlock
  | EmailDividerBlock
  | EmailSpacerBlock;
export type EmailBlockType = EmailBlock["type"];

export interface EmailDesign {
  width: number;
  background: string;
  contentBackground: string;
  padding: number;
}

export const DEFAULT_EMAIL_DESIGN: EmailDesign = {
  width: 600,
  background: "#F7F7F8",
  contentBackground: "#FFFFFF",
  padding: 56,
};

export type EmailFooterLinkLayout = "inline" | "stacked";

export interface EmailFooterLink {
  label: string;
  href: string;
}

export interface EmailFooter {
  brand: string;
  tagline: string;
  links: EmailFooterLink[];
  address: string;
  reason: string;
  align: EmailAlign;
  linkLayout: EmailFooterLinkLayout;
}

export const DEFAULT_EMAIL_FOOTER: EmailFooter = {
  brand: "Passenger",
  tagline: "Good things move with people.",
  links: [
    { label: "Help centre", href: "https://usepassenger.com/help" },
    { label: "Privacy", href: "https://usepassenger.com/privacy" },
  ],
  address: "Passenger, Jos, Plateau State, Nigeria.",
  reason: "You are receiving this because you have a Passenger account.",
  align: "left",
  linkLayout: "inline",
};

export const EMAIL_BLOCK_LABELS: Record<EmailBlockType, string> = {
  heading: "Heading",
  paragraph: "Text",
  image: "Image",
  button: "Button",
  divider: "Divider",
  spacer: "Spacer",
};

export function escapeHtmlAttribute(value: string) {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const LOGO_DATA_URI = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='1024' height='1024' viewBox='0 0 1024 1024'%3E%3Crect width='1024' height='1024' rx='224' fill='%23183E32'/%3E%3Cpath d='M302 702 701 303M338 303h363v363' fill='none' stroke='%23D8ED93' stroke-width='88' stroke-linecap='round' stroke-linejoin='round'/%3E%3Ccircle cx='302' cy='702' r='59' fill='%23D8ED93'/%3E%3C/svg%3E";

const FONT_STACK = "'Work Sans','Helvetica Neue',Helvetica,Arial,sans-serif";

export interface EmailShellOptions {
  microLabel: string;
  bodyHtml: string;
  headline?: string;
  cardHtml?: string;
  ctaHref?: string;
  ctaLabel?: string;
  noteHtml?: string;
  footerReason?: string;
  footer?: Partial<EmailFooter>;
  unsubscribeHref?: string;
  width?: number;
  pageBackground?: string;
  contentBackground?: string;
  padding?: number;
}

export function emailShell(options: EmailShellOptions) {
  const width = options.width ?? 600;
  const pageBackground = options.pageBackground ?? "#F7F7F8";
  const contentBackground = options.contentBackground ?? "#FFFFFF";
  const padding = options.padding ?? 56;
  const footer = { ...DEFAULT_EMAIL_FOOTER, ...(options.footer ?? {}) };
  const footerReason = options.footerReason ?? footer.reason;
  const footerAlign = footer.align ?? "left";
  const footerLinks = (footer.links ?? []).filter((link) => link.label.trim() && link.href.trim());
  if (options.unsubscribeHref) footerLinks.push({ label: "Unsubscribe", href: options.unsubscribeHref });
  const linksHtml = footerLinks
    .map((link) => `<a href="${escapeHtmlAttribute(link.href)}" style="color:#4B5563; text-decoration:none;">${escapeHtmlAttribute(link.label)}</a>`)
    .join(footer.linkLayout === "stacked" ? "<br>" : "&nbsp;·&nbsp;");
  const brandHtml = footer.brand.trim()
    ? `<p style="margin:0; font-family:${FONT_STACK}; font-size:12px; font-weight:600; letter-spacing:0.02em; text-transform:uppercase; color:#4B5563;">${escapeHtmlAttribute(footer.brand)}</p>`
    : "";
  const taglineHtml = footer.tagline.trim()
    ? `<p style="margin:6px 0 0 0; font-family:${FONT_STACK}; font-size:13px; font-weight:400; color:#7A7F87;">${escapeHtmlAttribute(footer.tagline)}</p>`
    : "";
  const linksBlockHtml = linksHtml
    ? `<p style="margin:16px 0 0 0; font-family:${FONT_STACK}; font-size:13px; font-weight:400; color:#7A7F87; line-height:1.7;">${linksHtml}</p>`
    : "";
  const reasonHtml = footerReason.trim() ? escapeHtmlAttribute(footerReason) : "";
  const addressHtml = footer.address.trim() ? escapeHtmlAttribute(footer.address) : "";
  const legalBlockHtml = reasonHtml || addressHtml
    ? `<p style="margin:16px 0 0 0; font-family:${FONT_STACK}; font-size:12px; font-weight:400; color:#9CA3AF; line-height:1.6;">${reasonHtml}${reasonHtml && addressHtml ? "<br>" : ""}${addressHtml}</p>`
    : "";
  const headline = options.headline
    ? `<h1 class="mobile-h1" style="margin:0 0 20px 0; font-family:${FONT_STACK}; font-size:28px; font-weight:600; line-height:1.25; letter-spacing:-0.015em; color:#2D362F;">${options.headline}</h1>`
    : "";
  const cta = options.ctaHref && options.ctaLabel
    ? `<tr>
          <td class="pad" style="padding:40px ${padding}px 0 ${padding}px;" align="left">
            <table role="presentation" class="mobile-btn" border="0" cellspacing="0" cellpadding="0" width="100%">
              <tr>
                <td align="left">
                  <table role="presentation" border="0" cellspacing="0" cellpadding="0">
                    <tr>
                      <td align="center" bgcolor="#34D186" style="border-radius:999px;">
                        <a href="${options.ctaHref}" target="_blank"
                           style="display:inline-block; padding:16px 32px; font-family:${FONT_STACK}; font-size:16px; font-weight:600; line-height:1; color:#FFFFFF; background-color:#34D186; border-radius:999px; text-decoration:none; mso-padding-alt:0px;">
                          ${options.ctaLabel}
                        </a>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
            ${options.noteHtml ? `<p style="margin:16px 0 0 0; font-family:${FONT_STACK}; font-size:13px; font-weight:400; line-height:1.6; color:#7A7F87;">${options.noteHtml}</p>` : ""}
          </td>
        </tr>`
    : "";
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
<body style="margin:0; padding:0; background-color:${pageBackground}; -webkit-text-size-adjust:100%; word-spacing:normal;">
<!--[if mso]>
<table role="presentation" align="center" border="0" cellspacing="0" cellpadding="0" width="${width}"><tr><td width="${width}">
<![endif]-->
<table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" bgcolor="${pageBackground}">
  <tr>
    <td align="center" class="mobile-px" style="padding:24px 16px 40px 16px;">
      <table role="presentation" class="container" width="${width}" border="0" cellspacing="0" cellpadding="0"
             style="width:${width}px; max-width:${width}px; background-color:${contentBackground}; border-radius:12px; overflow:hidden; margin:0 auto;">
        <tr>
          <td class="pad mobile-pt" style="padding:40px ${padding}px 0 ${padding}px;" align="left">
            <table role="presentation" border="0" cellspacing="0" cellpadding="0">
              <tr>
                <td style="vertical-align:middle; font-size:0; line-height:0;">
                  <img src="${LOGO_DATA_URI}" width="36" height="36" alt=""
                       style="display:block; width:36px; height:36px; border:0;"
                       data-replace="https://assets.passenger.ng/emails/logo-256.png">
                </td>
                <td style="vertical-align:middle; padding-left:12px;">
                  <span style="font-family:${FONT_STACK}; font-size:20px; font-weight:600; letter-spacing:-0.01em; color:#2D362F;">Passenger</span>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td class="pad mobile-hero-pt" style="padding:48px ${padding}px 0 ${padding}px;" align="left">
            <p style="margin:0 0 16px 0; font-family:${FONT_STACK}; font-size:12px; font-weight:600; letter-spacing:0.14em; text-transform:uppercase; color:#248A56;">${options.microLabel}</p>
            ${headline}
            <div class="mobile-body" style="font-family:${FONT_STACK}; font-size:17px; font-weight:400; line-height:1.75; color:#4B5563;">
              ${options.bodyHtml}
            </div>
          </td>
        </tr>
        ${options.cardHtml ?? ""}
        ${cta}
        <tr>
          <td class="pad mobile-pb" style="padding:56px ${padding}px 40px ${padding}px;" align="${footerAlign}">
            <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="width:100%; border-top:1px solid #E5E7EB;">
              <tr>
                <td style="padding:32px 0 0 0; text-align:${footerAlign};">
                  ${brandHtml}
                  ${taglineHtml}
                  ${linksBlockHtml}
                  ${legalBlockHtml}
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

const HEADING_SIZES: Record<EmailHeadingLevel, number> = { h1: 26, h2: 22, h3: 18 };
const IMAGE_WIDTHS: Record<EmailImageWidth, number> = { small: 40, medium: 60, large: 80, full: 100 };
const SPACER_HEIGHTS: Record<EmailSpacerSize, number> = { small: 16, medium: 32, large: 48 };

function isHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

export function renderEmailBlockHtml(block: EmailBlock): string {
  switch (block.type) {
    case "heading": {
      const size = HEADING_SIZES[block.level] ?? 22;
      return `<div style="margin:0 0 20px 0; text-align:${block.align};"><span style="font-family:${FONT_STACK}; font-size:${size}px; font-weight:600; line-height:1.3; letter-spacing:-0.01em; color:#2D362F;">${escapeHtmlAttribute(block.text)}</span></div>`;
    }
    case "paragraph": {
      const html = escapeHtmlAttribute(block.text).replace(/\r?\n/g, "<br>");
      return `<p style="margin:0 0 16px 0; font-family:${FONT_STACK}; font-size:17px; font-weight:400; line-height:1.7; color:#4B5563; text-align:${block.align};">${html}</p>`;
    }
    case "image": {
      const pct = IMAGE_WIDTHS[block.width] ?? 100;
      const img = `<img src="${escapeHtmlAttribute(block.url)}" alt="${escapeHtmlAttribute(block.alt)}" style="display:block; width:${pct}%; max-width:100%; height:auto; border-radius:8px; border:0; margin:0 auto;" />`;
      const inner = block.href && isHttpUrl(block.href)
        ? `<a href="${escapeHtmlAttribute(block.href)}" target="_blank" style="text-decoration:none;">${img}</a>`
        : img;
      return `<div style="margin:0 0 24px 0; text-align:${block.align};">${inner}</div>`;
    }
    case "button": {
      const primary = block.variant !== "secondary";
      const bg = primary ? "#34D186" : "#FFFFFF";
      const color = primary ? "#FFFFFF" : "#248A56";
      const border = primary ? "" : " border:1px solid #BCE2D1;";
      const href = isHttpUrl(block.href) ? escapeHtmlAttribute(block.href) : "#";
      return `<div style="margin:0 0 24px 0; text-align:${block.align};"><table role="presentation" border="0" cellspacing="0" cellpadding="0" style="display:inline-block;"><tr><td align="center" bgcolor="${bg}" style="border-radius:999px;${border}"><a href="${href}" target="_blank" style="display:inline-block; padding:16px 32px; font-family:${FONT_STACK}; font-size:16px; font-weight:600; line-height:1; color:${color}; background-color:${bg}; border-radius:999px; text-decoration:none;">${escapeHtmlAttribute(block.label)}</a></td></tr></table></div>`;
    }
    case "divider":
      return `<div style="margin:0 0 24px 0;"><hr style="border:none; border-top:1px solid #E5E7EB; margin:0; height:0;" /></div>`;
    case "spacer": {
      const height = SPACER_HEIGHTS[block.size] ?? 32;
      return `<div style="height:${height}px; line-height:${height}px; font-size:0;">&nbsp;</div>`;
    }
    default:
      return "";
  }
}

export function renderEmailBlockText(block: EmailBlock): string {
  switch (block.type) {
    case "heading":
    case "paragraph":
      return block.text;
    case "button":
      return `${block.label}${block.href ? `: ${block.href}` : ""}`;
    case "image":
      return block.alt ? `[Image: ${block.alt}]` : "[Image]";
    case "divider":
      return "---";
    case "spacer":
      return "";
  }
}

export function renderEmailDocument(args: { subject: string; blocks: EmailBlock[]; design?: EmailDesign; footer?: EmailFooter; unsubscribeUrl?: string; appUrl: string }): { html: string; text: string } {
  const design = { ...DEFAULT_EMAIL_DESIGN, ...(args.design ?? {}) };
  const footer = { ...DEFAULT_EMAIL_FOOTER, ...(args.footer ?? {}) };
  const bodyHtml = args.blocks.map(renderEmailBlockHtml).join("");
  const html = emailShell({
    microLabel: "Message from Passenger",
    bodyHtml: bodyHtml || `<p style="margin:0; font-family:${FONT_STACK}; font-size:17px; line-height:1.7; color:#4B5563;">Hello,</p>`,
    width: design.width,
    pageBackground: design.background,
    contentBackground: design.contentBackground,
    padding: design.padding,
    footer,
    ...(args.unsubscribeUrl ? { unsubscribeHref: args.unsubscribeUrl } : {}),
  });
  const text = args.blocks.map(renderEmailBlockText).filter(Boolean).join("\n\n");
  return { html, text: `${text}\n\nOpen Passenger: ${args.appUrl}`.trim() };
}
