import type { Request, Response } from "express";

export const adminSessionController = {
  /** Lets the admin UI confirm a session is valid and has admin rights before showing anything. */
  me(_req: Request, res: Response) {
    res.json({ data: res.locals.admin });
  },
};
