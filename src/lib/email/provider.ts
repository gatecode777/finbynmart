/**
 * Transactional email through a Resend-style HTTP API (POST { from, to, subject, text, html } with a bearer key).
 *
 * Honest by construction: with no provider configured nothing is sent and the caller is told `not_configured`, so no page
 * ever says "we emailed you" without an accepted send. "sent" means the provider accepted the message (HTTP 2xx), which is
 * all this code can know: it is not proof of inbox delivery.
 *
 * Environment: EMAIL_API_KEY and EMAIL_FROM are required; EMAIL_API_URL defaults to https://api.resend.com/emails and can
 * point at another compatible endpoint (the tests point it at a local stand-in server).
 */
export type EmailResult = { status: "sent" } | { status: "not_configured" } | { status: "failed"; reason: string };

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export function emailConfigured(): boolean {
  return Boolean(process.env.EMAIL_API_KEY && process.env.EMAIL_FROM);
}

export async function sendEmail(message: EmailMessage): Promise<EmailResult> {
  const key = process.env.EMAIL_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!key || !from) return { status: "not_configured" };
  try {
    const response = await fetch(process.env.EMAIL_API_URL || "https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [message.to], subject: message.subject, text: message.text, html: message.html }),
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) return { status: "failed", reason: `provider answered ${response.status}` };
    return { status: "sent" };
  } catch (error) {
    return { status: "failed", reason: error instanceof Error ? error.name : "network error" };
  }
}
