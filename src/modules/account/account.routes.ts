import { Router } from "express";
import { requireUser } from "../../middleware/require-user.js";
import { validate } from "../../middleware/validate.js";
import { idParamsSchema } from "../../utils/schemas.js";
import { accountController } from "./account.controller.js";
import { wishlistParamsSchema } from "./account.schema.js";

/** The signed-in customer's own data. Every route needs a session. */
export const accountRouter = Router();

accountRouter.use(requireUser);

accountRouter.get("/orders", accountController.listOrders);
accountRouter.get("/orders/:id", validate({ params: idParamsSchema }), accountController.getOrder);

accountRouter.get("/wishlist", accountController.wishlist);
accountRouter.put("/wishlist/:slug", validate({ params: wishlistParamsSchema }), accountController.addToWishlist);
accountRouter.delete(
  "/wishlist/:slug",
  validate({ params: wishlistParamsSchema }),
  accountController.removeFromWishlist,
);
