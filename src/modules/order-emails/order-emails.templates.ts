import { SHIPPING_PROMISE, STORE_NAME } from "../../config/store.js";
import type { ShippingAddress } from "../../utils/shipping-address.js";
import type { ConfirmationOrder, RenderedEmail } from "./order-emails.types.js";

// Emails use inline styles and tables: many email clients ignore <style> blocks and flexbox.

const COLORS = { page: "#0e0c0a", card: "#1a1714", text: "#f6f0e6", muted: "#a89d8d", line: "#352f28", brand: "#ff6b1a" };

/** Same short order number the admin panel shows: "#57AB6234". */
export function orderNumber(id: string): string {
  return `#${id.slice(0, 8).toUpperCase()}`;
}

function money(cents: number, currency: string): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: currency.toUpperCase() }).format(cents / 100);
}

/** Customer-supplied text (names, addresses) must never be read as HTML. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const countryNames = new Intl.DisplayNames(["en"], { type: "region" });

/** "MD" -> "Moldova"; unknown codes are shown as they are. */
function countryName(code: string): string {
  try {
    return countryNames.of(code) ?? code;
  } catch {
    return code;
  }
}

/** The address as it goes on a parcel, one line per entry. */
function addressLines(address: ShippingAddress | null): string[] {
  if (!address) return [];
  const cityLine = [address.postalCode, address.city].filter(Boolean).join(" ");
  return [
    address.name,
    address.line1,
    address.line2,
    [cityLine, address.state].filter(Boolean).join(", "),
    address.country ? countryName(address.country) : null,
  ].filter((line): line is string => Boolean(line));
}

export function renderOrderConfirmation(order: ConfirmationOrder, storefrontUrl: string | undefined): RenderedEmail {
  const number = orderNumber(order.id);
  const price = (cents: number) => money(cents, order.currency);
  const firstName = order.customerName?.trim().split(/\s+/)[0];
  const greeting = firstName ? `Thanks, ${firstName}!` : "Thanks for your order!";
  const address = addressLines(order.shippingAddress);

  const subject = `Order ${number} confirmed`;

  const text = [
    greeting,
    "",
    `We've received your payment for order ${number}. Your gear ships ${SHIPPING_PROMISE}.`,
    "",
    ...order.items.map((item) => `${item.quantity} x ${item.name}  ${price(item.lineTotalCents)}`),
    "",
    `Total paid: ${price(order.totalCents)}`,
    ...(address.length ? ["", "Shipping to:", ...address] : []),
    "",
    `Keep this email as your receipt.`,
    storefrontUrl ? `${STORE_NAME} - ${storefrontUrl}` : STORE_NAME,
  ].join("\n");

  const itemRows = order.items
    .map(
      (item) => `
        <tr>
          <td style="padding:10px 0;border-bottom:1px solid ${COLORS.line};color:${COLORS.text};">
            ${escapeHtml(item.name)}<br>
            <span style="color:${COLORS.muted};font-size:13px;">${item.quantity} x ${price(item.unitPriceCents)}</span>
          </td>
          <td align="right" style="padding:10px 0;border-bottom:1px solid ${COLORS.line};color:${COLORS.text};white-space:nowrap;">
            ${price(item.lineTotalCents)}
          </td>
        </tr>`,
    )
    .join("");

  const addressBlock = address.length
    ? `
        <p style="margin:24px 0 6px;color:${COLORS.brand};font-size:12px;font-weight:bold;text-transform:uppercase;letter-spacing:1px;">Shipping to</p>
        <p style="margin:0;color:${COLORS.text};line-height:1.6;">${address.map(escapeHtml).join("<br>")}</p>`
    : "";

  const shopLink = storefrontUrl
    ? `<a href="${escapeHtml(storefrontUrl)}" style="color:${COLORS.brand};text-decoration:none;">${STORE_NAME}</a>`
    : STORE_NAME;

  const html = `<!doctype html>
<html lang="en">
  <body style="margin:0;padding:0;background:${COLORS.page};font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${COLORS.page};">
      <tr>
        <td align="center" style="padding:32px 16px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:${COLORS.card};border-top:4px solid ${COLORS.brand};">
            <tr>
              <td style="padding:28px;">
                <p style="margin:0 0 18px;color:${COLORS.text};font-size:14px;font-weight:bold;letter-spacing:1px;">
                  FORGEFIT <span style="color:${COLORS.brand};">SUPPLY</span>
                </p>
                <h1 style="margin:0 0 10px;color:${COLORS.text};font-size:26px;">${escapeHtml(greeting)}</h1>
                <p style="margin:0 0 22px;color:${COLORS.muted};line-height:1.6;">
                  We've received your payment for order <strong style="color:${COLORS.text};">${number}</strong>.
                  Your gear ships ${SHIPPING_PROMISE}.
                </p>
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:15px;">
                  ${itemRows}
                  <tr>
                    <td style="padding:14px 0 0;color:${COLORS.text};font-weight:bold;">Total paid</td>
                    <td align="right" style="padding:14px 0 0;color:${COLORS.text};font-weight:bold;font-size:18px;">${price(order.totalCents)}</td>
                  </tr>
                </table>
                ${addressBlock}
                <p style="margin:28px 0 0;color:${COLORS.muted};font-size:13px;line-height:1.6;">
                  Keep this email as your receipt.<br>${shopLink}
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  return { subject, html, text };
}
