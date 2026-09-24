import { supabase } from "../../lib/supabase.js";

const PING_TIMEOUT_MS = 2000;

export const healthRepository = {
  /** Cheapest possible round trip: a HEAD request that returns no rows. */
  async pingDatabase(): Promise<boolean> {
    try {
      const { error } = await supabase
        .from("categories")
        .select("id", { head: true })
        .limit(1)
        .abortSignal(AbortSignal.timeout(PING_TIMEOUT_MS));
      return error === null;
    } catch {
      return false;
    }
  },
};
