import { z } from "zod";

const originList = z
  .string()
  .default("")
  .transform((value) =>
    value
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean),
  )
  // Normalise to a bare origin so "https://app.vercel.app/" matches the browser's Origin header.
  .pipe(z.array(z.url().transform((url) => new URL(url).origin)));

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).optional(),
  SUPABASE_URL: z.url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  CORS_ORIGINS: originList,
  // Checkout is optional: without these the API still runs and checkout answers 503.
  STRIPE_SECRET_KEY: z
    .string()
    .regex(/^(sk|rk)_(test|live)_/, "Must be a Stripe secret key (sk_test_...)")
    .optional(),
  STRIPE_WEBHOOK_SECRET: z.string().startsWith("whsec_", "Must start with whsec_").optional(),
  // Order confirmation emails are optional too: without a key, orders just aren't emailed.
  RESEND_API_KEY: z.string().startsWith("re_", "Must be a Resend API key (re_...)").optional(),
  // Sender shown to customers. resend.dev works without a domain, but only delivers to
  // the email address of your own Resend account; verify a domain to email anyone.
  EMAIL_FROM: z.string().min(3).default("ForgeFit Supply <onboarding@resend.dev>"),
  // Where Stripe sends shoppers after paying. Defaults to the first CORS origin.
  STOREFRONT_URL: z
    .url()
    .transform((url) => new URL(url).origin)
    .optional(),
});

// Dashboards often save a cleared field as "", which should count as "not set".
const rawEnv = Object.fromEntries(Object.entries(process.env).filter(([, value]) => value !== ""));

const parsed = envSchema.safeParse(rawEnv);

if (!parsed.success) {
  const problems = parsed.error.issues.map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`);
  console.error(
    `Invalid environment configuration:\n${problems.join("\n")}\nSee .env.example for the expected variables.`,
  );
  process.exit(1);
}

const isProduction = parsed.data.NODE_ENV === "production";

export const env = {
  ...parsed.data,
  isProduction,
  storefrontUrl:
    parsed.data.STOREFRONT_URL ??
    parsed.data.CORS_ORIGINS[0] ??
    (isProduction ? undefined : "http://localhost:3000"),
};
