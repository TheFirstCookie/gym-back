import type { Json } from "../types/database.js";

/** Where to ship, flattened from what Stripe Checkout collected. */
export type ShippingAddress = {
  name: string | null;
  line1: string | null;
  line2: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  /** ISO 3166-1 alpha-2, e.g. "MD". */
  country: string | null;
};

function textOrNull(value: Json | undefined): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function isObject(value: Json | undefined): value is { [key: string]: Json | undefined } {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * orders.shipping_address holds Stripe's shipping_details as-is:
 * { name, address: { line1, line2, city, state, postal_code, country } }.
 */
export function toShippingAddress(value: Json | null): ShippingAddress | null {
  if (!isObject(value)) return null;
  const address = isObject(value.address) ? value.address : {};

  return {
    name: textOrNull(value.name),
    line1: textOrNull(address.line1),
    line2: textOrNull(address.line2),
    city: textOrNull(address.city),
    state: textOrNull(address.state),
    postalCode: textOrNull(address.postal_code),
    country: textOrNull(address.country),
  };
}
