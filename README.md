# ForgeFit Supply API

REST API for **ForgeFit Supply**, a portfolio e-commerce shop for gym and sport equipment.
It serves the Next.js storefront (deployed on Vercel) from a Supabase Postgres database and
runs on Render's free tier.

## Stack

- **Node 22** + **Express 5** + **TypeScript** (strict, ESM)
- **Supabase Postgres**, accessed server-side with `@supabase/supabase-js` and the service-role key
- **zod** for environment and request validation
- **helmet** and **cors** for HTTP hardening
- **tsx** for development, `tsc` for the production build

Express 5 forwards rejected promises from async handlers to the error handler, so there is
no `asyncHandler` wrapper and no try/catch boilerplate in controllers.

## Project structure

```
.
├── render.yaml                      # Render Blueprint
├── supabase/
│   ├── migrations/
│   │   ├── 0001_initial_schema.sql        # tables, indexes, view, triggers, RLS
│   │   ├── 0002_product_search.sql        # listing view + search/facets/related functions
│   │   └── 0003_product_images_bucket.sql # Storage bucket for product photos (Supabase only)
│   └── seed.sql                     # catalog matching the frontend mock data
└── src/
    ├── server.ts                    # HTTP server + graceful shutdown
    ├── app.ts                       # Express app: middleware, routes, error handling
    ├── config/
    │   ├── env.ts                   # zod-validated environment (fails fast)
    │   └── cors.ts                  # allowed origins
    ├── lib/
    │   ├── logger.ts                # JSON logs in production, readable locally
    │   └── supabase.ts              # single service-role client
    ├── middleware/
    │   ├── error-handler.ts         # every error -> { error: { code, message, details? } }
    │   ├── not-found.ts
    │   ├── request-logger.ts
    │   ├── require-admin.ts         # Supabase session + admin role check for /admin routes
    │   └── validate.ts              # zod validation of params / query / body
    ├── routes/
    │   └── index.ts                 # mounts module routers under /api/v1
    ├── types/
    │   ├── database.ts              # typed Supabase schema
    │   └── express.d.ts             # res.locals typing
    ├── utils/
    │   ├── http-error.ts            # HttpError + notFound(), conflict(), forbidden(), ...
    │   ├── db-errors.ts             # constraint violations -> 400 / 409
    │   ├── pagination.ts            # ?page & pageSize -> limit/offset + response meta
    │   ├── schemas.ts               # shared zod schemas (slug, id, repeated query params)
    │   └── slugify.ts
    └── modules/
        ├── health/                  # GET /health
        ├── categories/              # GET /categories[/:slug]
        │   ├── categories.routes.ts
        │   ├── categories.controller.ts
        │   ├── categories.service.ts
        │   ├── categories.repository.ts
        │   ├── categories.schema.ts
        │   └── categories.types.ts
        ├── brands/                  # GET /brands
        ├── products/                # GET /products[/:slug[/related]]
        ├── admin-session/           # GET /admin/session/me
        ├── admin-products/          # /admin/products CRUD
        └── admin-uploads/           # POST /admin/uploads/product-images
```

## Local setup

Requires Node 22.9 or newer (`nvm use` reads `.nvmrc`).

```bash
npm install
cp .env.example .env   # then fill in the Supabase values
npm run dev            # http://localhost:4000, restarts on file changes
```

| Script              | What it does                                   |
| ------------------- | ---------------------------------------------- |
| `npm run dev`       | Runs `src/server.ts` with tsx in watch mode    |
| `npm run build`     | Compiles to `dist/`                            |
| `npm start`         | Runs the compiled server                       |
| `npm run typecheck` | Type-checks without emitting                   |

`.env` is loaded automatically when present (Node's `--env-file-if-exists`). If a variable
is missing or malformed, the server exits at startup with a list of what's wrong.

| Variable                    | Required | Notes                                                                   |
| --------------------------- | -------- | ----------------------------------------------------------------------- |
| `SUPABASE_URL`              | yes      | Project URL                                                             |
| `SUPABASE_SERVICE_ROLE_KEY` | yes      | Server-only secret; bypasses RLS                                        |
| `CORS_ORIGINS`              | no       | Comma-separated origins; `http://localhost:3000` is added outside production |
| `PORT`                      | no       | Defaults to `4000`; Render sets its own                                 |
| `NODE_ENV`                  | no       | `development` (default), `test` or `production`                         |
| `LOG_LEVEL`                 | no       | `debug`, `info`, `warn` or `error`                                      |

## Supabase setup

1. Create a project at [supabase.com](https://supabase.com) (the free plan is enough).
2. Apply the schema and seed data, using either option:
   - **SQL Editor** (simplest): paste and run each file in `supabase/migrations/` in order
     (`0001`, `0002`, `0003`), then `supabase/seed.sql`.
   - **Supabase CLI**: run `npx supabase init` once (it creates `supabase/config.toml` and
     keeps the existing files), then `npx supabase link --project-ref <ref>` and
     `npx supabase db push --include-seed`.
3. Copy the credentials into `.env`:
   - `SUPABASE_URL`: **Project Settings > Data API > Project URL**
   - `SUPABASE_SERVICE_ROLE_KEY`: **Project Settings > API Keys**, either a secret key
     (`sb_secret_…`) or the legacy `service_role` key

The seed is idempotent (it upserts by slug), so it's safe to run again.

### Admin account

The `/admin` routes accept only a signed-in Supabase user whose `app_metadata.role` is
`admin`. Only the service role can write `app_metadata`, so users can't promote themselves.

1. **Authentication > Users > Add user > Create new user**: enter your email and a password,
   and tick **Auto Confirm User**.
2. In the **SQL Editor**, grant the role (use the same email):

   ```sql
   update auth.users
   set raw_app_meta_data = raw_app_meta_data || '{"role": "admin"}'::jsonb
   where email = 'you@example.com';
   ```

3. Optional but recommended: **Authentication > Sign In / Providers**, turn off
   **Allow new users to sign up**, so the admin login can't be used to create accounts.

The role is checked on every request, so removing it takes effect immediately.

### Row Level Security

Row Level Security is enabled on every table. Categories, brands and active products have
a public read-only policy, so the frontend can later read them (or subscribe through
Supabase Realtime) with the anon key. Orders have no policies, so only this server can
access them.

## Deploying to Render

**With the Blueprint:** in the Render dashboard choose **New > Blueprint**, select this
repository, and fill in the three secret variables when prompted (`SUPABASE_URL`,
`SUPABASE_SERVICE_ROLE_KEY`, `CORS_ORIGINS`).

**Manually:** create a **Web Service** from the repository with:

- Runtime: Node, plan: Free
- Build command: `npm ci --include=dev && npm run build`
- Start command: `npm start`
- Health check path: `/api/v1/health`
- Environment: `NODE_ENV=production` plus the three variables above

`--include=dev` matters: with `NODE_ENV=production`, `npm ci` skips devDependencies and the
TypeScript build would fail.

Set `CORS_ORIGINS` to the Vercel URL(s), e.g. `https://forgefit.vercel.app`, and point the
frontend's `NEXT_PUBLIC_API_URL` at the Render URL.

Free-tier services spin down after about 15 minutes without traffic, and the first request
after that takes up to a minute while the instance starts. Supabase free projects also
pause after a week of inactivity.

## API

All routes are prefixed with `/api/v1`. Successful responses are wrapped in `{ "data": ... }`;
errors always look like:

```json
{ "error": { "code": "not_found", "message": "Category \"foo\" not found" } }
```

Validation failures use `code: "validation_error"` and list the problems in `details`.

### Public

| Method | Path                      | Description                                                  |
| ------ | ------------------------- | ------------------------------------------------------------ |
| GET    | `/health`                 | Status, uptime and a database ping (`db: "up"` or `"down"`)  |
| GET    | `/categories`             | All categories in display order, with active product counts  |
| GET    | `/categories/:slug`       | One category; 404 if the slug doesn't exist                  |
| GET    | `/brands`                 | All brands, alphabetical                                     |
| GET    | `/products`               | Active products: filters, search, sort, pages, brand facets  |
| GET    | `/products/:slug`         | One active product with description and specs                |
| GET    | `/products/:slug/related` | Up to `?limit=` (default 3) related products                 |

`GET /products` query parameters, all optional:

| Parameter  | Example               | Notes                                                         |
| ---------- | --------------------- | ------------------------------------------------------------- |
| `category` | `strength`            | Category slug                                                 |
| `brand`    | `ironline`            | Brand slug; repeat it to combine brands                       |
| `q`        | `kettle bell`         | Every word must match, as a prefix; name matches rank first   |
| `sort`     | `price-asc`           | `featured` (default), `price-asc`, `price-desc`, `newest`     |
| `page`     | `2`                   | Starts at 1                                                   |
| `pageSize` | `24`                  | 1 to 100, default 24                                          |

```json
{
  "data": [
    {
      "id": "…", "name": "Competition Kettlebell", "slug": "competition-kettlebell",
      "priceCents": 8600, "currency": "usd", "stock": 24, "tag": "New", "image": "https://…",
      "category": { "id": "…", "name": "Strength", "slug": "strength" },
      "brand": { "id": "…", "name": "Kinetic Supply", "slug": "kinetic-supply" }
    }
  ],
  "meta": {
    "pagination": { "page": 1, "pageSize": 24, "total": 1, "totalPages": 1 },
    "facets": { "brands": [{ "id": "…", "name": "Ironline", "slug": "ironline", "count": 0 }] }
  }
}
```

Prices are integer cents. Brand facet counts ignore the `brand` filter, so every brand chip
can show how many products it would add.

### Admin

Send the Supabase session's access token as `Authorization: Bearer <token>`. A missing or
expired token gets 401, a non-admin account 403.

| Method | Path                             | Description                                                     |
| ------ | -------------------------------- | --------------------------------------------------------------- |
| GET    | `/admin/session/me`              | The signed-in admin (`id`, `email`)                             |
| GET    | `/admin/products`                | Like `/products`, plus `status=active\|inactive\|all` (default `all`) |
| GET    | `/admin/products/:id`            | One product, including hidden ones                              |
| POST   | `/admin/products`                | Create; `slug` is generated from `name` when omitted            |
| PATCH  | `/admin/products/:id`            | Update only the fields sent                                     |
| DELETE | `/admin/products/:id`            | Hide the product (`isActive: false`); restore with PATCH        |
| POST   | `/admin/uploads/product-images`  | Signed URL for uploading one photo straight to Storage          |

Product body fields: `name`, `slug`, `categoryId`, `brandId`, `priceCents`, `currency`,
`stock`, `tag`, `imageUrl`, `description`, `specs` (array of strings), `sortOrder`,
`isActive`. Unknown fields are rejected. A duplicate slug returns 409.

"Deleting" hides a product instead of removing the row, so past orders keep their link to it.

Image uploads: `POST /admin/uploads/product-images` with `{ "contentType": "image/webp" }`
returns `path`, `token` and `publicUrl`. The browser uploads the file with Supabase's
`storage.from("product-images").uploadToSignedUrl(path, token, file)`, then saves
`publicUrl` as the product's `imageUrl`. The bucket accepts JPEG, PNG, WebP and AVIF up to 5 MB.

Category shape (matches the frontend's `Category` type):

```json
{ "id": "…", "name": "Strength", "slug": "strength", "accent": "#ff6b1a", "count": 2 }
```

The health endpoint returns 200 even when the database is unreachable (`status: "degraded"`),
so Render doesn't restart a healthy instance during a Supabase outage.

## Adding a new module

Each feature lives in `src/modules/<name>/` and is split by responsibility:

| File              | Responsibility                                                                  |
| ----------------- | ------------------------------------------------------------------------------- |
| `*.routes.ts`     | Express router: paths, `validate(...)` middleware, controller methods           |
| `*.controller.ts` | Reads the (already validated) request, calls the service, sends `{ data }`      |
| `*.service.ts`    | Business rules; throws `HttpError`s such as `notFound()`                        |
| `*.repository.ts` | The only layer that talks to Supabase                                           |
| `*.mapper.ts`     | snake_case rows -> camelCase API shapes (when there's more than a line of it)   |
| `*.schema.ts`     | zod schemas for params, query and body                                          |
| `*.types.ts`      | Row and DTO types                                                               |

To add one (for example `products`):

1. Add a migration in `supabase/migrations/` and mirror the change in `src/types/database.ts`
   (or generate it with `npx supabase gen types typescript --linked`).
2. Create the module files following `categories/`.
3. Mount the router in `src/routes/index.ts`, e.g. `apiRouter.use("/products", productsRouter)`.

Routes that need the raw request body (the Stripe webhook) are mounted in `src/app.ts`
**before** `express.json()`; there's a marked spot for it. For socket.io, `src/server.ts`
already creates an explicit `http.Server` that it can attach to.
