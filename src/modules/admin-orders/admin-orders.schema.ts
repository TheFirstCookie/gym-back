import { z } from "zod";
import { paginationQuerySchema } from "../../utils/pagination.js";
import { searchQuerySchema } from "../../utils/schemas.js";

export const ORDER_STATUSES = ["pending", "paid", "fulfilled", "cancelled", "refunded"] as const;

export const adminOrderListQuerySchema = paginationQuerySchema.extend({
  status: z.enum([...ORDER_STATUSES, "all"]).default("all"),
  /** Part of the customer's email or name, or of the order id. */
  q: searchQuerySchema,
});

/**
 * The only status changes an admin makes by hand: ship a paid order, or undo that.
 * Payment and cancellation are driven by Stripe (see the checkout module).
 */
export const updateOrderSchema = z.strictObject({
  status: z.enum(["fulfilled", "paid"]),
});

/** Full refund through Stripe; `restock` also puts the items back on the shelf. */
export const refundOrderSchema = z.strictObject({
  restock: z.boolean().default(false),
});

export type RefundOrderInput = z.infer<typeof refundOrderSchema>;
export type AdminOrderListQuery = z.infer<typeof adminOrderListQuerySchema>;
export type UpdateOrderInput = z.infer<typeof updateOrderSchema>;
