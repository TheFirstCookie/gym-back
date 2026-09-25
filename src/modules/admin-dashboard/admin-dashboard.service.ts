import { LOW_STOCK_THRESHOLD, STORE_CURRENCY } from "../../config/store.js";
import { adminDashboardRepository } from "./admin-dashboard.repository.js";
import type { DashboardQuery } from "./admin-dashboard.schema.js";
import type { Dashboard, DashboardStatsRow } from "./admin-dashboard.types.js";

// Postgres sums arrive as numbers or numeric strings depending on size; normalise them.
const num = (value: number | string) => Number(value);

function toDashboard(row: DashboardStatsRow): Dashboard {
  const revenueCents = num(row.revenue_cents);
  const orderCount = num(row.order_count);

  return {
    currency: row.currency,
    days: row.days,
    sales: {
      revenueCents,
      orderCount,
      averageOrderCents: orderCount ? Math.round(revenueCents / orderCount) : 0,
      previousRevenueCents: num(row.previous_revenue_cents),
      previousOrderCount: num(row.previous_order_count),
      allTimeRevenueCents: num(row.all_time_revenue_cents),
    },
    orders: {
      toShip: num(row.to_ship_count),
      awaitingPayment: num(row.awaiting_payment_count),
    },
    daily: row.daily.map((day) => ({
      date: day.date,
      revenueCents: num(day.revenue_cents),
      orderCount: num(day.order_count),
    })),
    topProducts: row.top_products.map((product) => ({
      productId: product.product_id,
      name: product.name,
      units: num(product.units),
      revenueCents: num(product.revenue_cents),
    })),
    lowStock: row.low_stock.map((product) => ({
      id: product.id,
      name: product.name,
      slug: product.slug,
      stock: product.stock,
      image: product.image_url,
    })),
    recentOrders: row.recent_orders.map((order) => ({
      id: order.id,
      status: order.status,
      customerName: order.customer_name,
      customerEmail: order.customer_email,
      totalCents: num(order.total_cents),
      currency: order.currency,
      createdAt: order.created_at,
    })),
    lowStockThreshold: LOW_STOCK_THRESHOLD,
  };
}

export const adminDashboardService = {
  async get({ days }: DashboardQuery): Promise<Dashboard> {
    const row = await adminDashboardRepository.stats({
      currency: STORE_CURRENCY,
      days,
      lowStock: LOW_STOCK_THRESHOLD,
    });
    return toDashboard(row);
  },
};
