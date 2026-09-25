import { z } from "zod";

/** Reporting window in days. A few fixed choices keep the chart readable. */
export const dashboardQuerySchema = z.object({
  days: z.coerce
    .number()
    .pipe(z.union([z.literal(7), z.literal(30), z.literal(90)]))
    .default(30),
});

export type DashboardQuery = z.infer<typeof dashboardQuerySchema>;
