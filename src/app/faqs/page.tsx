import { permanentRedirect } from "next/navigation";

/** Alias: the canonical Help Center & FAQs page is /help (the footer still links /faqs). */
export default function FaqsAlias() {
  permanentRedirect("/help");
}
