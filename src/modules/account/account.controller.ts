import type { Request, Response } from "express";
import type { IdParams } from "../../utils/schemas.js";
import type { WishlistParams } from "./account.schema.js";
import { accountService } from "./account.service.js";

// Every route here runs behind requireUser, so res.locals.user is always set.
const userId = (res: Response) => res.locals.user!.id;

export const accountController = {
  async listOrders(_req: Request, res: Response) {
    res.json({ data: await accountService.listOrders(userId(res)) });
  },

  async getOrder(req: Request<IdParams>, res: Response) {
    res.json({ data: await accountService.getOrder(userId(res), req.params.id) });
  },

  async wishlist(_req: Request, res: Response) {
    res.json({ data: await accountService.wishlist(userId(res)) });
  },

  async addToWishlist(req: Request<WishlistParams>, res: Response) {
    await accountService.addToWishlist(userId(res), req.params.slug);
    res.status(204).end();
  },

  async removeFromWishlist(req: Request<WishlistParams>, res: Response) {
    await accountService.removeFromWishlist(userId(res), req.params.slug);
    res.status(204).end();
  },
};
