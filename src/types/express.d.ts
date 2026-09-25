import type { AdminUser } from "../middleware/require-admin.js";

// Values middleware attaches to res.locals for later handlers.
declare global {
  namespace Express {
    interface Locals {
      /** Set by requireAdmin on every /admin route. */
      admin?: AdminUser;
    }
  }
}

export {};
