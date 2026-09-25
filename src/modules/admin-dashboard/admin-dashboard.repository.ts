import { supabase } from "../../lib/supabase.js";
import type { DashboardStatsRow } from "./admin-dashboard.types.js";

export const adminDashboardRepository = {
  async stats(params: { currency: string; days: number; lowStock: number }): Promise<DashboardStatsRow> {
    const { data } = await supabase
      .rpc("admin_dashboard_stats", {
        p_currency: params.currency,
        p_days: params.days,
        p_low_stock: params.lowStock,
      })
      .throwOnError();

    return data as unknown as DashboardStatsRow;
  },

  /** When the first sale in this currency was paid, or null before the first sale. */
  async firstSaleAt(currency: string): Promise<string | null> {
    const { data } = await supabase
      .from("orders")
      .select("paid_at")
      .in("status", ["paid", "fulfilled"])
      .eq("currency", currency)
      .order("paid_at", { ascending: true })
      .limit(1)
      .maybeSingle()
      .throwOnError();

    return data?.paid_at ?? null;
  },
};
