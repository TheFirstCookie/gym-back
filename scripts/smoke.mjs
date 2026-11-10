import assert from "node:assert/strict";

// Read-only check against a running API and storefront; no accounts or payments needed.
const api = (process.env.API_BASE_URL ?? "http://localhost:4000").replace(/\/$/, "");
const storefront = (process.env.STOREFRONT_URL ?? "http://localhost:3000").replace(/\/$/, "");
async function json(path) {
  const response = await fetch(`${api}/api/v1${path}`, { signal: AbortSignal.timeout(70_000) });
  assert.equal(response.status, 200, path);
  const body = await response.json();
  assert.ok(body && "data" in body, "API envelope");
  return body;
}
const listing = await json("/products?pageSize=1");
assert.ok(Array.isArray(listing.data));
assert.equal(typeof listing.meta.pagination.total, "number");
assert.ok(listing.data.length, "Smoke test requires one active catalog product");
const summary = listing.data[0];
const { data: product } = await json(`/products/${encodeURIComponent(summary.slug)}`);
assert.equal(product.id, summary.id);
assert.ok(Array.isArray(product.variants));
assert.equal(typeof product.hasVariants, "boolean");
assert.equal(typeof product.priceCents, "number");
const { data: rating } = await json(`/products/${encodeURIComponent(summary.slug)}/reviews/summary`);
assert.equal(rating.distribution.length, 5);
for (const path of ["/", `/product/${encodeURIComponent(summary.slug)}`, "/account/sign-in"]) {
  const response = await fetch(`${storefront}${path}`, { signal: AbortSignal.timeout(70_000) });
  assert.equal(response.status, 200, path);
  assert.ok(response.headers.get("content-security-policy")?.includes("frame-ancestors 'none'"));
  assert.equal(response.headers.get("x-frame-options"), "DENY");
  assert.ok((await response.text()).includes("ForgeFit"));
}
console.log("Storefront/API catalog and security-header smoke checks passed");
