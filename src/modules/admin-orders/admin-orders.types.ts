import type { Database } from "../../types/database.js";
import type { Pagination } from "../../utils/pagination.js";

export type OrderStatus = Database["public"]["Enums"]["order_status"];

export type OrderRow = Database["public"]["Tables"]["orders"]["Row"];
export type OrderItemRow = Database["public"]["Tables"]["order_items"]["Row"];
export type OrderListRow = Database["public"]["Functions"]["admin_search_orders"]["Returns"][number];

/** One row of the admin order table. */
export type AdminOrderListItem = {
  id: string;
  status: OrderStatus;
  customerEmail: string | null;
  customerName: string | null;
  currency: string;
  totalCents: number;
  itemCount: number;
  createdAt: string;
  paidAt: string | null;
  fulfilledAt: string | null;
};

/** Where to ship, flattened from what Stripe Checkout collected. */
export type ShippingAddress = {
  name: string | null;
  line1: string | null;
  line2: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  /** ISO 3166-1 alpha-2, e.g. "MD". */
  country: string | null;
};

export type AdminOrderItem = {
  id: string;
  /** null when the product has since been deleted; the name and price are snapshots. */
  productId: string | null;
  name: string;
  unitPriceCents: number;
  quantity: number;
  lineTotalCents: number;
};

/** Everything the admin needs to pack and ship one order. */
export type AdminOrder = AdminOrderListItem & {
  subtotalCents: number;
  shippingAddress: ShippingAddress | null;
  cancelledAt: string | null;
  updatedAt: string;
  stripe: {
    checkoutSessionId: string | null;
    paymentIntentId: string | null;
    /** The payment in the Stripe dashboard, when there is one. */
    dashboardUrl: string | null;
  };
  items: AdminOrderItem[];
};

export type OrderStatusCounts = Record<OrderStatus | "all", number>;

export type AdminOrderListResponse = {
  data: AdminOrderListItem[];
  meta: {
    pagination: Pagination;
    /** Orders per status across the whole shop (not just this search), for the tabs. */
    counts: OrderStatusCounts;
  };
};
