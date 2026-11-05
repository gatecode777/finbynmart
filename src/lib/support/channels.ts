/**
 * The support channels that are REALLY set up. Nothing is invented and nothing is copied from a design: an e-mail address, a phone
 * number and opening hours exist only when SUPPORT_EMAIL, SUPPORT_PHONE and SUPPORT_HOURS are configured (values that do not look
 * valid are ignored), and Live Chat is reported as not available because no chat provider exists, so it is never shown as Online.
 * The two channels that always exist are the ticket form and the public Contact Us form.
 */
export interface SupportChannel {
  key: "ticket" | "contact" | "email" | "phone" | "chat";
  label: string;
  available: boolean;
  /** Where it leads (a path, an anchor, mailto: or tel:), or null. */
  href: string | null;
  /** The configured address, number or hours, shown as text. */
  detail: string | null;
  note: string | null;
}

const EMAIL = /^[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9.-]{1,190}\.[A-Za-z]{2,24}$/;
const PHONE = /^\+?[0-9][0-9 ()-]{5,18}$/;

export function getSupportChannels(env: Record<string, string | undefined> = process.env): SupportChannel[] {
  const email = env.SUPPORT_EMAIL?.trim();
  const phone = env.SUPPORT_PHONE?.trim();
  const hours = env.SUPPORT_HOURS?.trim();
  const channels: SupportChannel[] = [
    { key: "ticket", label: "Support Ticket", available: true, href: "#raise-ticket", detail: null, note: "Raise a ticket on this page. It is saved with a reference you can quote." },
    { key: "contact", label: "Contact Us form", available: true, href: "/contact-us", detail: null, note: "Send Finbyn Mart a message without a ticket." },
  ];
  if (email && EMAIL.test(email)) channels.push({ key: "email", label: "Email Support", available: true, href: `mailto:${email}`, detail: email, note: null });
  if (phone && PHONE.test(phone)) channels.push({ key: "phone", label: "Call Support", available: true, href: `tel:${phone.replace(/[^+0-9]/g, "")}`, detail: phone, note: hours && hours.length <= 80 && !/[<>]/.test(hours) ? hours : null });
  channels.push({ key: "chat", label: "Live Chat", available: false, href: null, detail: null, note: "Live chat is not available yet." });
  return channels;
}
