// Store-wide business settings (not secrets, so they live in code rather than env vars).

/** Currency the dashboard reports in. Products default to it (see migration 0001). */
export const STORE_CURRENCY = "usd";

/** Live products at or below this stock level show up as "low stock" on the dashboard. */
export const LOW_STOCK_THRESHOLD = 5;

/** Brand details used in customer emails. */
export const STORE_NAME = "ForgeFit Supply";
export const SHIPPING_PROMISE = "within 15 days";
