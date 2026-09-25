import { LOW_STOCK_THRESHOLD, STORE_CURRENCY } from "../../config/store.js";
import { adminDashboardRepository } from "./admin-dashboard.repository.js";
import type { DashboardQuery, DashboardRange } from "./admin-dashboard.schema.js";
import type { ChartBucket, Dashboard, DashboardStatsRow } from "./admin-dashboard.types.js";

const DAY_MS = 24 * 60 * 60 * 1000;
/** "All time" before the first sale shows this many days, so the chart isn't empty-looking. */
const EMPTY_SHOP_DAYS = 30;
/** Ten years of daily rows is still a small query; past that the chart would be unreadable. */
const MAX_DAYS = 3650;

// Postgres sums arrive as numbers or numeric strings depending on size; normalise them.
const num = (value: number | string) => Number(value);

/** Days from the first sale's UTC day to today, both included. */
function daysSince(iso: string): number {
  const startOfUtcDay = (date: Date) => Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  const days = Math.round((startOfUtcDay(new Date()) - startOfUtcDay(new Date(iso))) / DAY_MS) + 1;
  return Math.min(MAX_DAYS, Math.max(1, days));
}

/** Up to ~3 months a column per day; up to 2 years per week; beyond that per month. */
function bucketFor(days: number): ChartBucket {
  if (days <= 90) return "day";
  if (days <= 730) return "week";
  return "month";
}

type Point = Dashboard["series"][number];

/** Groups daily points into weeks (7-day runs from the start) or calendar months. */
function groupSeries(daily: Point[], bucket: ChartBucket): Point[] {
  if (bucket === "day") return daily;

  const groups = new Map<string, Point>();
  daily.forEach((day, index) => {
    const key = bucket === "week" ? String(Math.floor(index / 7)) : day.date.slice(0, 7);
    const group = groups.get(key);
    if (group) {
      group.revenueCents += day.revenueCents;
      group.orderCount += day.orderCount;
    } else {
      // Each group is labelled with its first day.
      groups.set(key, { ...day });
    }
  });
  return [...groups.values()];
}

function toDashboard(row: DashboardStatsRow, range: DashboardRange): Dashboard {
  const revenueCents = num(row.revenue_cents);
  const orderCount = num(row.order_count);
  const bucket = bucketFor(row.days);
  const daily = row.daily.map((day) => ({
    date: day.date,
    revenueCents: num(day.revenue_cents),
    orderCount: num(day.order_count),
  }));

  return {
    currency: row.currency,
    range,
    days: row.days,
    since: daily[0]?.date ?? new Date().toISOString().slice(0, 10),
    sales: {
      revenueCents,
      orderCount,
      averageOrderCents: orderCount ? Math.round(revenueCents / orderCount) : 0,
      // "Before all time" has nothing to compare with.
      previousRevenueCents: range === "all" ? null : num(row.previous_revenue_cents),
      previousOrderCount: range === "all" ? null : num(row.previous_order_count),
      allTimeRevenueCents: num(row.all_time_revenue_cents),
    },
    orders: {
      toShip: num(row.to_ship_count),
      awaitingPayment: num(row.awaiting_payment_count),
    },
    bucket,
    series: groupSeries(daily, bucket),
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
  async get({ days: range }: DashboardQuery): Promise<Dashboard> {
    let days: number;
    if (range === "all") {
      const firstSale = await adminDashboardRepository.firstSaleAt(STORE_CURRENCY);
      days = firstSale ? daysSince(firstSale) : EMPTY_SHOP_DAYS;
    } else {
      days = range;
    }

    const row = await adminDashboardRepository.stats({ currency: STORE_CURRENCY, days, lowStock: LOW_STOCK_THRESHOLD });
    return toDashboard(row, range);
  },
};
