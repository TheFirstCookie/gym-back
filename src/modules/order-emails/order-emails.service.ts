import { env } from "../../config/env.js";
import { email } from "../../lib/email.js";
import { logger } from "../../lib/logger.js";
import { orderEmailsRepository } from "./order-emails.repository.js";
import { renderOrderConfirmation } from "./order-emails.templates.js";

export const orderEmailsService = {
  async retryDue(): Promise<void> {
    if (!email.isConfigured()) return;
    for (const orderId of await orderEmailsRepository.due()) await orderEmailsService.sendOrderConfirmation(orderId);
  },
  /**
   * Emails the customer their order confirmation, once. Never throws: a failed email must
   * not fail the payment webhook or the confirmation page. The durable outbox schedules
   * failed jobs independently; abandoned claims can be reclaimed after five minutes.
   */
  async sendOrderConfirmation(orderId: string): Promise<void> {
    if (!email.isConfigured()) return;

    let claimed: string | null = null;
    try {
      const order = await orderEmailsRepository.findOrder(orderId);
      if (!order?.customerEmail) return;

      claimed = await orderEmailsRepository.claimConfirmation(orderId);
      if (!claimed) return; // Already sent (or being sent right now).

      const { id } = await email.send({ to: order.customerEmail, ...renderOrderConfirmation(order, env.storefrontUrl) }, `order-confirmation-${orderId}`);
      await orderEmailsRepository.finishConfirmation(orderId, claimed, true);
      logger.info("Order confirmation sent", { orderId, emailId: id });
    } catch (error) {
      logger.error("Couldn't send the order confirmation", { orderId, err: error });
      if (claimed) {
        await orderEmailsRepository.finishConfirmation(orderId, claimed, false).catch((releaseError: unknown) => {
          logger.error("Couldn't release the confirmation claim", { orderId, err: releaseError });
        });
      }
    }
  },
};
