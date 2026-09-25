import type { AdminUser } from "../middleware/require-admin.js";
import type { CustomerUser } from "../middleware/require-user.js";

// Values middleware attaches to res.locals for later handlers.
declare global {
  namespace Express {
    interface Locals {
      /** Set by requireAdmin on every /admin route. */
      admin?: AdminUser;
      /** Set by requireUser (always) and optionalUser (when signed in). */
      user?: CustomerUser;
    }
  }
}

export {};
