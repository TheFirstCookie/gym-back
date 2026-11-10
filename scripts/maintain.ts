import { checkoutService } from "../src/modules/checkout/checkout.service.js";
import { orderEmailsService } from "../src/modules/order-emails/order-emails.service.js";

await checkoutService.maintain();
await orderEmailsService.retryDue();
