import type { OrderStatus } from "../admin-orders/admin-orders.types.js";
import type { DashboardRange } from "./admin-dashboard.schema.js";

/** The shape admin_dashboard_stats (migration 0007) returns. */
export type DashboardStatsRow = {
  currency: string;
  days: number;
  revenue_cents: number;
  order_count: number;
  previous_revenue_cents: number;
  previous_order_count: number;
  all_time_revenue_cents: number;
  to_ship_count: number;
  awaiting_payment_count: number;
  daily: { date: string; revenue_cents: number; order_count: number }[];
  top_products: { product_id: string | null; name: string; units: number; revenue_cents: number }[];
  low_stock: { id: string; name: string; slug: string; stock: number; image_url: string | null }[];
  recent_orders: {
    id: string;
    status: OrderStatus;
    customer_name: string | null;
    customer_email: string | null;
    total_cents: number;
    currency: string;
    created_at: string;
  }[];
};

export type ChartBucket = "day" | "week" | "month";

export type Dashboard = {
  currency: string;
  range: DashboardRange;
  /** Length of the window in days, today included. */
  days: number;
  /** First day of the window (UTC, "YYYY-MM-DD"). */
  since: string;
  /** Sales in the window, and in the same span before it (null for "all"). */
  sales: {
    revenueCents: number;
    orderCount: number;
    averageOrderCents: number;
    previousRevenueCents: number | null;
    previousOrderCount: number | null;
    allTimeRevenueCents: number;
  };
  orders: {
    toShip: number;
    awaitingPayment: number;
  };
  /** Revenue over time, oldest first. Long windows are grouped by week or month. */
  bucket: ChartBucket;
  series: { date: string; revenueCents: number; orderCount: number }[];
  topProducts: { productId: string | null; name: string; units: number; revenueCents: number }[];
  lowStock: { id: string; name: string; slug: string; stock: number; image: string | null }[];
  /** Latest paid orders (any status after payment). */
  recentOrders: {
    id: string;
    status: OrderStatus;
    customerName: string | null;
    customerEmail: string | null;
    totalCents: number;
    currency: string;
    createdAt: string;
  }[];
  lowStockThreshold: number;
};
