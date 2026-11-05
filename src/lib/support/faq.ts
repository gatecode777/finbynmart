import { FAQ_CATEGORIES, type FaqCategory } from "./ticketRules";

/**
 * The FAQ source of the buyer support page and `GET /api/public/faqs`.
 *
 * There is no FAQ database, CMS or admin screen in the project, so the published FAQs are kept here, in the repository, and a change
 * is a reviewed code change until an admin-managed source exists (docs/backend/PAGE_36_SUPPORT_FAQ_RULES.md). Rules for what may be
 * written here: only how-to answers about screens and flows that EXIST today, and where a flow depends on something not built (a
 * supplier cannot yet send a quotation, nobody creates orders yet, suppliers are not notified automatically) the answer says so.
 * NEVER a policy Finbyn Mart has not stated: no payment options, fees, delivery promises, refund or return windows, response times,
 * or verification promises. That is why Payments, Delivery and Returns have no category.
 */
export interface Faq {
  id: string;
  category: FaqCategory;
  question: string;
  answer: string;
  /** Only published items are ever returned. */
  published: boolean;
  order: number;
}

export const FAQS: Faq[] = [
  { id: "inq-send", category: "inquiries", order: 10, published: true, question: "How do I send an inquiry or ask for a quote?", answer: "Open a product or a supplier's page and use Get Best Quote or Send Inquiry. Fill in the form and submit it: you get an inquiry reference, and the inquiry appears in My Inquiries. Suppliers are not notified automatically yet, so a reply is not guaranteed through this site." },
  { id: "inq-track", category: "inquiries", order: 20, published: true, question: "Where can I see my inquiries and their status?", answer: "In My Inquiries in the sidebar. Every inquiry you sent is listed with its reference, supplier and status, and you can open one to see its details and recorded history." },
  { id: "inq-cancel", category: "inquiries", order: 30, published: true, question: "Can I cancel an inquiry?", answer: "Yes, while it is still new, awaiting a response or in progress: use Cancel Inquiry in My Inquiries or on the inquiry's page. A cancelled inquiry stays in your list as Cancelled." },
  { id: "quo-where", category: "quotations", order: 10, published: true, question: "Where do I find quotations from suppliers?", answer: "In Quotations in the sidebar. You can open a quotation, compare quotations of the same inquiry, accept, reject, or ask for a revision. Suppliers cannot send quotations through Finbyn Mart yet, so the list stays empty until that is connected." },
  { id: "quo-accept", category: "quotations", order: 20, published: true, question: "What does accepting a quotation do?", answer: "It records your decision on that exact version of the quotation. It does not create an order, take a payment or notify the supplier automatically." },
  { id: "ord-where", category: "orders", order: 10, published: true, question: "Where do I see my orders?", answer: "In Orders in the sidebar, with their status, amount and expected delivery where one is recorded. Orders cannot be created through the site yet, so the list is empty until that is connected." },
  { id: "ord-cancel", category: "orders", order: 20, published: true, question: "Can I ask to cancel an order?", answer: "Before it is dispatched, yes: Request Cancellation on the order. It sends a request only. The order is not cancelled until the supplier agrees, and the supplier is not notified automatically yet." },
  { id: "prod-save", category: "products", order: 10, published: true, question: "How do I save a product to look at later?", answer: "Press the heart on a product card or page. Your saved products are listed under Saved Products, where you can search them and send an inquiry." },
  { id: "prod-compare", category: "products", order: 20, published: true, question: "How do I compare products?", answer: "Press the Compare button on a product card or page, or in Saved Products. You can compare up to four products side by side under Compare Products. Prices in the catalogue are estimates, not quotations." },
  { id: "sup-save", category: "suppliers", order: 10, published: true, question: "How do I save and compare suppliers?", answer: "Use Save Supplier on a supplier's page or the heart on a supplier card. Saved Suppliers lists them, and you can select two to four of them to compare." },
  { id: "acc-password", category: "account", order: 10, published: true, question: "How do I change my password?", answer: "Open Settings & Notifications, go to the Settings tab and use Change Password. Your other devices are signed out when you change it." },
  { id: "acc-company", category: "account", order: 20, published: true, question: "How do I add or edit my company details?", answer: "Open Profile & Company in the sidebar. You can edit your personal details, add your company's details and upload company documents. Documents are not reviewed or verified yet." },
  { id: "tech-ticket", category: "technical", order: 10, published: true, question: "How do I report a problem?", answer: "Raise a support ticket on this page: choose a category, describe the issue and attach screenshots or documents if they help. Your ticket is saved with a reference you can quote. No support team replies through this site yet." },
  { id: "tech-contact", category: "technical", order: 20, published: true, question: "Is there another way to contact Finbyn Mart?", answer: "Yes: the Contact Us form sends a message without a ticket. Any phone or e-mail channel appears under Other Ways to Get Help only when it has actually been set up." },
];

export interface FaqQuery {
  q?: string;
  category?: string;
}

/** The published FAQs, optionally narrowed by category and a text search over the question and the answer. A draft is never returned. */
export function getPublishedFaqs(query: FaqQuery = {}, source: Faq[] = FAQS): Faq[] {
  const needle = (query.q ?? "").normalize("NFKC").trim().toLowerCase().slice(0, 60);
  return source
    .filter((f) => f.published)
    .filter((f) => !query.category || f.category === query.category)
    .filter((f) => !needle || f.question.toLowerCase().includes(needle) || f.answer.toLowerCase().includes(needle))
    .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
}

/** The categories that really have a published FAQ, with their counts (an empty category is not offered). */
export function getFaqCategories(source: Faq[] = FAQS): { value: FaqCategory; label: string; count: number }[] {
  return FAQ_CATEGORIES.map((c) => ({ ...c, count: source.filter((f) => f.published && f.category === c.value).length })).filter((c) => c.count > 0);
}
