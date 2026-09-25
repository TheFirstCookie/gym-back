import { env } from "../../config/env.js";
import { email } from "../../lib/email.js";
import { logger } from "../../lib/logger.js";
import { orderEmailsRepository } from "./order-emails.repository.js";
import { renderOrderConfirmation } from "./order-emails.templates.js";

export const orderEmailsService = {
  /**
   * Emails the customer their order confirmation, once. Never throws: a failed email must
   * not fail the payment webhook or the confirmation page. After a failure the claim is
   * released, so the next paid-event for this order (e.g. a Stripe retry) tries again.
   */
  async sendOrderConfirmation(orderId: string): Promise<void> {
    if (!email.isConfigured()) return;

    let claimed = false;
    try {
      const order = await orderEmailsRepository.findOrder(orderId);
      if (!order?.customerEmail) return;

      claimed = await orderEmailsRepository.claimConfirmation(orderId);
      if (!claimed) return; // Already sent (or being sent right now).

      const { id } = await email.send({ to: order.customerEmail, ...renderOrderConfirmation(order, env.storefrontUrl) });
      logger.info("Order confirmation sent", { orderId, emailId: id });
    } catch (error) {
      logger.error("Couldn't send the order confirmation", { orderId, err: error });
      if (claimed) {
        await orderEmailsRepository.releaseConfirmation(orderId).catch((releaseError: unknown) => {
          logger.error("Couldn't release the confirmation claim", { orderId, err: releaseError });
        });
      }
    }
  },
};
