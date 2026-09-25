import { HttpError, notFound } from "../../utils/http-error.js";
import { toLimitOffset, toPagination } from "../../utils/pagination.js";
import { toAdminOrder, toAdminOrderListItem, toStatusCounts } from "./admin-orders.mapper.js";
import { adminOrdersRepository } from "./admin-orders.repository.js";
import type { AdminOrderListQuery, UpdateOrderInput } from "./admin-orders.schema.js";
import type { AdminOrder, AdminOrderListResponse, OrderStatus } from "./admin-orders.types.js";

type ManualStatus = UpdateOrderInput["status"];

/**
 * Manual status changes: which status an order must be in to move to the target, and the
 * columns that change with it. Anything else (pending -> fulfilled, reviving a cancelled
 * order, ...) is refused with 409.
 */
const TRANSITIONS: Record<ManualStatus, { from: OrderStatus[]; fulfilledAt: () => string | null }> = {
  // Ship a paid order.
  fulfilled: { from: ["paid"], fulfilledAt: () => new Date().toISOString() },
  // Undo "shipped" (e.g. marked by mistake). Payment details are untouched.
  paid: { from: ["fulfilled"], fulfilledAt: () => null },
};

export const adminOrdersService = {
  async list(query: AdminOrderListQuery): Promise<AdminOrderListResponse> {
    const [result, counts] = await Promise.all([
      adminOrdersRepository.search({
        status: query.status === "all" ? null : query.status,
        query: query.q,
        ...toLimitOffset(query),
      }),
      adminOrdersRepository.statusCounts(),
    ]);

    return {
      data: result.rows.map(toAdminOrderListItem),
      meta: {
        pagination: toPagination(query, result.total),
        counts: toStatusCounts(counts),
      },
    };
  },

  async getById(id: string): Promise<AdminOrder> {
    const row = await adminOrdersRepository.findById(id);
    if (!row) throw notFound("Order not found");
    return toAdminOrder(row);
  },

  /** Idempotent: asking for the status the order already has just returns it. */
  async updateStatus(id: string, { status }: UpdateOrderInput): Promise<AdminOrder> {
    const rule = TRANSITIONS[status];
    const moved = await adminOrdersRepository.transition(id, rule.from, status, {
      fulfilled_at: rule.fulfilledAt(),
    });

    const order = await adminOrdersService.getById(id);
    if (!moved && order.status !== status) {
      throw new HttpError(
        409,
        "invalid_status_transition",
        `A ${order.status} order can't be marked as ${status}`,
        { status: order.status },
      );
    }

    return order;
  },
};
