import { env } from "../config/env.js";

// Transactional email through Resend's HTTP API (https://resend.com/docs/api-reference).
// A plain fetch keeps the dependency list short; swap this file to change providers.

const RESEND_URL = "https://api.resend.com/emails";

export type EmailMessage = {
  to: string;
  subject: string;
  html: string;
  /** Plain-text version for clients that don't render HTML (and for spam filters). */
  text: string;
};

export const email = {
  /** False when RESEND_API_KEY isn't set; callers then skip sending. */
  isConfigured(): boolean {
    return Boolean(env.RESEND_API_KEY);
  },

  /** Sends one message and returns the provider's id. Throws when delivery is refused. */
  async send(message: EmailMessage): Promise<{ id: string }> {
    if (!env.RESEND_API_KEY) throw new Error("Email isn't configured (RESEND_API_KEY is missing)");

    const response = await fetch(RESEND_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: env.EMAIL_FROM,
        to: [message.to],
        subject: message.subject,
        html: message.html,
        text: message.text,
      }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(`Resend refused the email (${response.status}): ${detail.slice(0, 300)}`);
    }

    return (await response.json()) as { id: string };
  },
};
