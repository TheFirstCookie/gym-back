import { z } from "zod";

/**
 * Reporting window: the last 7, 30 or 90 days, or "all" (since the first sale). A few
 * fixed choices keep the chart readable.
 */
export const dashboardQuerySchema = z.object({
  days: z
    .union([z.literal("all"), z.coerce.number().pipe(z.union([z.literal(7), z.literal(30), z.literal(90)]))])
    .default(30),
});

export type DashboardQuery = z.infer<typeof dashboardQuerySchema>;
export type DashboardRange = DashboardQuery["days"];
