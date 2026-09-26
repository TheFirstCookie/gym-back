import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    // src/config/env.ts validates these at import time. Nothing here reaches a real
    // service: tests replace the repositories and the Stripe gateway with fakes.
    env: {
      NODE_ENV: "test",
      LOG_LEVEL: "error",
      SUPABASE_URL: "http://127.0.0.1:54321",
      SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key",
      CORS_ORIGINS: "http://localhost:3000",
      STRIPE_SECRET_KEY: "sk_test_forgefit",
      STRIPE_WEBHOOK_SECRET: "whsec_forgefit_test",
    },
    restoreMocks: true,
  },
});
