/**
 * How an order line reads where only one line of text fits (Stripe's payment page, the
 * plain-text email): "Olympic plate (20 kg)", or just the name for a plain product.
 */
export function itemLabel(name: string, variantName: string | null | undefined): string {
  return variantName ? `${name} (${variantName})` : name;
}

/** Order lines sorted for display: by product, then by variant. */
export function byItemName<T extends { name: string; variantName: string | null }>(a: T, b: T): number {
  return a.name.localeCompare(b.name) || (a.variantName ?? "").localeCompare(b.variantName ?? "", undefined, { numeric: true });
}
