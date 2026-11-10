# Integrity and security update

Apply this update in order: database migration, backend deployment, frontend deployment. The two repositories have coordinated API changes. Do not deploy the new editor against the previous API.

1. Take a database backup, then apply `supabase/migrations/0011_integrity_and_recovery.sql` in the Supabase SQL editor or your normal migration runner. Fresh installations need migrations 0001 through 0011, in order. Existing installations must not rerun the initial schema or seed.
2. Deploy the backend with the updated lockfile (`npm ci`, `npm run build`). Verify `/api/v1/health`. Migration 0011 must be present before starting this backend: the maintenance worker and product editor use its new columns/functions.
3. In the Stripe webhook endpoint's event selection, enable `checkout.session.completed`, `checkout.session.expired`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `charge.refunded`, `refund.created`, `refund.updated`, and `refund.failed`. Keep the existing signing secret. A pending refund is not a completed refund.
4. Deploy the frontend with its updated lockfile. Keep `NEXT_PUBLIC_API_URL`, Supabase public configuration, site URL, and backend CORS origins aligned.
5. Run the read-only integration smoke check while both services are running: `npm run smoke`. It defaults to API `http://localhost:4000` and shop `http://localhost:3000`; set `API_BASE_URL` and `STOREFRONT_URL` to check another environment. It needs an active product and checks catalog DTOs, the rating endpoint, rendered pages, and frontend security headers.

## Admin sign-in and MFA

There is no built-in password in the source code. Admins are Supabase Auth users with `app_metadata.role = "admin"`. Find them in **Supabase dashboard → Authentication → Users** and inspect their app metadata. Sign in at the shop's `/account/sign-in`, then open `/admin`.

Passwords cannot be retrieved. Use the password-reset flow with an email address you control, or create your own user in Supabase and grant that account the admin role using the SQL in README. Do not commit credentials or promote an email address supplied by an untrusted request.

To require MFA for every admin API call:

1. Enable TOTP MFA in Supabase Auth if it was disabled.
2. Sign in, open `/account/settings`, enable the authenticator, and verify the enrollment code.
3. Set backend `ADMIN_REQUIRE_MFA=true` and redeploy/restart it. Every admin request then requires a server-verified session with `aal2`; the admin screen offers an authenticator challenge for subsequent sign-ins.

The setting defaults to false to permit enrollment before enforcing it. Password complexity and any reauthentication/leaked-password policy must also be enabled in the Supabase Auth dashboard; browser password checks are only usability checks.

`TRUST_PROXY_HOPS` defaults to 1 for the current single-proxy setup. Verify this against the actual hosting proxy chain; use 0 when serving clients directly. Rate counters are process-local; configure shared counters/edge limiting before scaling to multiple instances. Stripe signature-verified webhooks are deliberately outside the general shopper request limiter so checkout bursts do not suppress payment delivery.

## Inventory and product edits

The editor sends product fields and the entire variant list in one POST/PATCH transaction. Updates that write stock or variants require `expectedUpdatedAt`, the exact timestamp from the admin product response. A concurrent checkout or edit produces HTTP 409 `stale_product`; reload before saving instead of overwriting stock with an old count.

Variants referenced by orders cannot be removed. Hide them with `isActive: false`. Converting an ordered plain product into a variant inventory is refused; create a separate product instead. Stock from a historical deleted variant is never restored into an arbitrary plain product. Review any affected inventory from before this update manually because the original deleted variant cannot be reconstructed reliably.

## Payment and email recovery

The running API checks durable reservations, refunds, and email jobs every minute. SQL/pg_cron cleanup now releases only orders for which no Stripe attempt was started. A linked or uncertain request is checked against Stripe first. Completed delayed payments retain their reservation until a definitive outcome. Old ambiguous reservations are searched by the order's Stripe client reference; an incomplete/unavailable search retains stock.

If a successful payment cannot be applied to an existing cancelled/missing order, the backend records a payment exception, logs an error, and returns a retryable response instead of acknowledging success. Inspect the order's Stripe reference, payment, and current inventory; fulfill it only if possible or issue the appropriate refund in Stripe. Reconcile legacy cancelled orders that had already been paid before this migration; this update cannot infer physical stock or undo historical shipments.

Refunds have their own status and stable attempt ID. Pending refunds keep the original order status and cannot be shipped through the admin API. Definitive failed/cancelled attempts can be retried with a new ID. Fulfillment stays blocked for payment/inventory exceptions. Restocking follows confirmed successful refunds and remains idempotent.

Email jobs are queued in the payment transaction. Claims expire after five minutes, failed sends back off, and `confirmation_email_sent_at` is written after delivery succeeds. Resend receives a stable per-order idempotency key. Its provider idempotency window is finite: no distributed email system can guarantee exactly-once delivery across an arbitrarily long outage after delivery but before recording success.

The worker runs only while the API process is awake. On a sleeping/free host, retries resume when it restarts; use an uptime monitor or a scheduled `npm run maintenance:once` job if you require a retry schedule independent of shopper traffic.

## Storage cleanup

`npm run images:cleanup` previews old unreferenced objects and does not delete anything. The script considers only UUID-named product images older than seven days and checks references from hidden/active products and pending checkout image snapshots.

After reviewing its output, `npm run images:cleanup -- --delete` rechecks references immediately before removal. Run this during a quiet maintenance window: database references and external object deletion cannot be committed atomically. Do not run removal while an editor may deliberately reuse an old, currently unreferenced URL. Legacy checkouts predate image snapshots; wait for those to finish before the first removal run.

## Verification and rollback

Run backend `npm run typecheck`, `npm test`, and `npm run build`; run frontend lint, typecheck, tests, and build. Both CI workflows also run dependency auditing. SQL integration tests use an isolated PostgreSQL engine and do not contact the hosted database; Storage, pg_cron, real Stripe payments, and hosted Auth policies still need staging verification.

The migration adds columns/jobs and replaces functions. Do not drop those columns to roll back code. The old editor does not send concurrency tokens, so rolling it back requires an explicit coordinated plan; letting stale stock writes succeed would reintroduce the inventory bug.
