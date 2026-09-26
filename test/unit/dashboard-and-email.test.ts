import { afterEach, describe, expect, it, vi } from "vitest";
import { adminDashboardRepository } from "../../src/modules/admin-dashboard/admin-dashboard.repository.js";
import { adminDashboardService } from "../../src/modules/admin-dashboard/admin-dashboard.service.js";
import type { DashboardStatsRow } from "../../src/modules/admin-dashboard/admin-dashboard.types.js";
import { renderOrderConfirmation } from "../../src/modules/order-emails/order-emails.templates.js";

/** A stats row with one paid order of $10 on each day of the window. */
function statsRow(days: number, firstDay = "2026-01-01"): DashboardStatsRow {
  const start = Date.parse(`${firstDay}T00:00:00Z`);
  return {
    currency: "usd",
    days,
    revenue_cents: days * 1000,
    order_count: days,
    previous_revenue_cents: 500,
    previous_order_count: 1,
    all_time_revenue_cents: days * 1000,
    to_ship_count: 2,
    awaiting_payment_count: 1,
    daily: Array.from({ length: days }, (_, index) => ({
      date: new Date(start + index * 86_400_000).toISOString().slice(0, 10),
      revenue_cents: 1000,
      order_count: 1,
    })),
    top_products: [],
    low_stock: [],
    recent_orders: [],
  };
}

describe("admin dashboard", () => {
  afterEach(() => vi.useRealTimers());

  it("keeps one column per day up to 90 days, with the change against the period before", async () => {
    vi.spyOn(adminDashboardRepository, "stats").mockResolvedValue(statsRow(30));

    const dashboard = await adminDashboardService.get({ days: 30 });

    expect(dashboard.bucket).toBe("day");
    expect(dashboard.series).toHaveLength(30);
    expect(dashboard.sales).toMatchObject({ revenueCents: 30_000, averageOrderCents: 1000, previousRevenueCents: 500 });
    expect(dashboard.orders).toEqual({ toShip: 2, awaitingPayment: 1 });
  });

  it("groups all-time sales by week and has nothing to compare with", async () => {
    vi.useFakeTimers({ now: new Date("2026-06-30T12:00:00Z"), toFake: ["Date"] });
    vi.spyOn(adminDashboardRepository, "firstSaleAt").mockResolvedValue("2026-01-01T09:00:00Z");
    const stats = vi.spyOn(adminDashboardRepository, "stats").mockResolvedValue(statsRow(181));

    const dashboard = await adminDashboardService.get({ days: "all" });

    // Jan 1 to Jun 30, both included.
    expect(stats).toHaveBeenCalledWith(expect.objectContaining({ days: 181 }));
    expect(dashboard.bucket).toBe("week");
    expect(dashboard.series).toHaveLength(26);
    expect(dashboard.series[0]).toEqual({ date: "2026-01-01", revenueCents: 7000, orderCount: 7 });
    // Grouping never loses money.
    expect(dashboard.series.reduce((sum, point) => sum + point.revenueCents, 0)).toBe(181_000);
    expect(dashboard.sales.previousRevenueCents).toBeNull();
  });

  it("uses calendar months past two years", async () => {
    vi.spyOn(adminDashboardRepository, "firstSaleAt").mockResolvedValue("2023-01-01T00:00:00Z");
    vi.spyOn(adminDashboardRepository, "stats").mockResolvedValue(statsRow(800, "2024-01-01"));

    const dashboard = await adminDashboardService.get({ days: "all" });

    expect(dashboard.bucket).toBe("month");
    expect(dashboard.series[0]).toMatchObject({ date: "2024-01-01", revenueCents: 31_000 });
    expect(dashboard.series[1]).toMatchObject({ date: "2024-02-01", revenueCents: 29_000 });
  });
});

describe("order confirmation email", () => {
  const order = {
    id: "57ab6234-0000-4000-8000-000000000000",
    customerEmail: "ana@example.com",
    customerName: "<b>Ana</b> Buyer",
    currency: "usd",
    subtotalCents: 17200,
    totalCents: 17200,
    shippingAddress: {
      name: "Ana & Co",
      line1: "Str. 1",
      line2: null,
      city: "Chisinau",
      state: null,
      postalCode: "2000",
      country: "MD",
    },
    items: [{ name: "Competition <Kettlebell>", unitPriceCents: 8600, quantity: 2, lineTotalCents: 17200 }],
  };

  it("has the order number, lines and total", () => {
    const email = renderOrderConfirmation(order, "https://shop.example");
    expect(email.subject).toBe("Order #57AB6234 confirmed");
    expect(email.text).toContain("2 x Competition <Kettlebell>  $172.00");
    expect(email.text).toContain("Total paid: $172.00");
    expect(email.text).toContain("Moldova");
  });

  it("never lets customer text become HTML", () => {
    const { html } = renderOrderConfirmation(order, undefined);
    expect(html).not.toContain("<b>Ana</b>");
    expect(html).toContain("Thanks, &lt;b&gt;Ana&lt;/b&gt;!");
    expect(html).toContain("Competition &lt;Kettlebell&gt;");
    expect(html).toContain("Ana &amp; Co");
  });
});
