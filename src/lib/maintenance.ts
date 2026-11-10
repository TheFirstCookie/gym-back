import { logger } from "./logger.js";
import { checkoutService } from "../modules/checkout/checkout.service.js";
import { orderEmailsService } from "../modules/order-emails/order-emails.service.js";

/** Database claims/idempotency make this safe across instances; each process avoids overlap. */
export function startMaintenance() {
  let running = false;
  let stopped = false;
  const tick = async () => {
    if (running || stopped) return;
    running = true;
    try {
      await checkoutService.maintain();
      await orderEmailsService.retryDue();
    } catch (error) {
      logger.error("Maintenance failed; will retry", { err: error });
    } finally { running = false; }
  };
  const timer = setInterval(() => void tick(), 60_000).unref();
  void tick();
  return () => { stopped = true; clearInterval(timer); };
}
