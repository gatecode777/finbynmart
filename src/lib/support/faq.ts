import { FAQ_CATEGORIES, type FaqCategory } from "./ticketRules";

/**
 * THE one FAQ source: the public Help Center (`/help`), the buyer and supplier support pages and `GET /api/public/faqs` all read it.
 *
 * There is no FAQ database, CMS or admin screen in the project, so the published FAQs are kept here, in the repository, and a change
 * is a reviewed code change until an admin-managed source exists (docs/backend/PAGE_36_SUPPORT_FAQ_RULES.md). Rules for what may be
 * written here: only how-to answers about screens and flows that EXIST today, and where a flow depends on something not built
 * the answer says so. Every entry is public-safe (nothing about any account) because the public page and API show all published items.
 * NEVER a policy Finbyn Mart has not stated: no payment options, fees, delivery promises, refund or return windows, response times,
 * rankings, guaranteed leads or verification promises. That is why Payments, Delivery and Returns have no category.
 * Wording is draft and needs business approval (docs/page-designs/PAGE_15_HELP_CENTER_COMPLETION.md maps each answer to its evidence).
 */
export interface FaqLink { label: string; href: string }
export interface Faq {
  id: string;
  category: FaqCategory;
  question: string;
  answer: string;
  /** Existing routes the Help Center shows under the answer (the support pages and the API do not use them). */
  links?: FaqLink[];
  /** Only published items are ever returned. */
  published: boolean;
  order: number;
}

export const FAQS: Faq[] = [
  { id: "acc-buyer", category: "account", order: 5, published: true, question: "How do I create a buyer account?", answer: "Open Sign Up and register as a buyer with your name, e-mail address and a password. If e-mail delivery is set up on the site, you confirm your e-mail address with a link before you sign in; if it is not set up, your account is ready straight away.", links: [{ label: "Sign Up as Buyer", href: "/sign-up" }] },
  { id: "acc-supplier", category: "account", order: 6, published: true, question: "How do I register as a supplier?", answer: "Use Register as Supplier. Registering creates your account and opens the supplier portal, where you add your company information. Registering does not verify your business.", links: [{ label: "Register as Supplier", href: "/register-supplier" }] },
  { id: "acc-reset", category: "account", order: 7, published: true, question: "How do I reset my password?", answer: "Open Forgot Password and enter your e-mail address. A reset link is sent by e-mail when e-mail delivery is set up on the site. If it is not, the page says so and you can contact Finbyn Mart through the Contact Us form.", links: [{ label: "Forgot Password", href: "/forgot-password" }, { label: "Contact Us", href: "/contact-us" }] },
  { id: "acc-password", category: "account", order: 10, published: true, question: "How do I change my password?", answer: "Sign in first. Buyers open Settings & Notifications, go to the Settings tab and use Change Password; suppliers use Account Security in the supplier portal. Your other devices are signed out when you change it. Account Security also shows where you are signed in. Two-step verification is not available.", links: [{ label: "Sign In", href: "/sign-in" }] },
  { id: "acc-company", category: "account", order: 20, published: true, question: "How do I add or edit my company details?", answer: "Buyers open Profile & Company in the sidebar: you can edit your personal details, add your company's details and upload company documents. Suppliers use Company Profile in the supplier portal. Uploading documents does not verify a company." },

  { id: "prod-save", category: "products", order: 10, published: true, question: "How do I save a product to look at later?", answer: "Press the heart on a product card or page. Your saved products are listed under Saved Products, where you can search them and send an inquiry." },
  { id: "prod-compare", category: "products", order: 20, published: true, question: "How do I compare products?", answer: "Press the Compare button on a product card or page, or in Saved Products. You can compare up to four products side by side under Compare Products. Prices in the catalogue are estimates, not quotations.", links: [{ label: "Browse Products", href: "/products" }] },
  { id: "sup-save", category: "suppliers", order: 10, published: true, question: "How do I save and compare suppliers?", answer: "Use Save Supplier on a supplier's page or the heart on a supplier card. Saved Suppliers lists them, and you can select two to four of them to compare.", links: [{ label: "Find Suppliers", href: "/suppliers" }] },

  { id: "inq-send", category: "inquiries", order: 10, published: true, question: "How do I contact a selected supplier or ask for a quote?", answer: "Open a product or a supplier's page and use Get Best Quote or Send Inquiry. Fill in the form and submit it: you get an inquiry reference. Signed-in buyers follow it in My Inquiries; a guest inquiry cannot be tracked online, so keep the reference. The supplier sees it in its own portal; whether and when a supplier replies is up to the supplier." },
  { id: "inq-track", category: "inquiries", order: 20, published: true, question: "Where can I see my inquiries and responses?", answer: "Sign in and open My Inquiries. Every inquiry you sent is listed with its reference, supplier and status. Open one to see its details, history, each supplier's replies and any quotations. No minimum number of responses is guaranteed.", links: [{ label: "My Inquiries", href: "/buyer/inquiries" }] },
  { id: "inq-cancel", category: "inquiries", order: 30, published: true, question: "Can I cancel an inquiry?", answer: "Yes, while it is still new, awaiting a response or in progress: use Cancel Inquiry in My Inquiries or on the inquiry's page. A cancelled inquiry stays in your list as Cancelled." },

  { id: "req-what", category: "requirements", order: 10, published: true, question: "What is a General Requirement?", answer: "It is a request that is not addressed to one supplier. Open Post Your Requirement, choose the catalogue product that best describes what you need, add the quantity and your city, and post it. Posting needs a buyer account.", links: [{ label: "Post Your Requirement", href: "/post-requirement" }] },
  { id: "req-who", category: "requirements", order: 20, published: true, question: "Which suppliers receive my inquiry or requirement?", answer: "A direct inquiry goes to the supplier you selected. When you are signed in as a buyer and it is about a catalogue product, it is also shared with other active suppliers that offer the same product (same category, same product name and, where stated, the same colour). A general requirement has no selected supplier: it is shared with active suppliers whose products match the one you chose, not with every supplier. This sharing is part of sending, not an option, and it is processed after you submit: it is not instant and no timing is promised. Suppliers do not receive your e-mail, phone number or address through Finbyn Mart, but text you type yourself is shown as written." },
  { id: "req-product", category: "requirements", order: 30, published: true, question: "Why must I choose a product when I post a requirement?", answer: "Matching suppliers are found from the product you choose, so the requirement needs one. A requirement written only in free text cannot be posted or matched yet." },

  { id: "quo-where", category: "quotations", order: 10, published: true, question: "Where do I find quotations from suppliers?", answer: "Sign in and open Quotations. You can open a quotation, accept it, reject it, or ask for a revision, and compare the versions of a quotation. The list stays empty until a supplier sends you one. Finbyn Mart does not rank quotations or pick a best one.", links: [{ label: "Quotations", href: "/buyer/quotations" }] },
  { id: "quo-conversations", category: "quotations", order: 15, published: true, question: "How do private supplier conversations work?", answer: "Each supplier you deal with has its own conversation under your inquiry, and other suppliers cannot see it. Messages are plain text. There are no attachments, read receipts or delivery confirmations." },
  { id: "quo-compare", category: "quotations", order: 18, published: true, question: "Why might quotations not be directly comparable?", answer: "Each quotation shows what that supplier stated: price, currency, unit, tax, validity and terms. They can differ, and prices in different currencies are never converted, added up or ranked." },
  { id: "quo-accept", category: "quotations", order: 20, published: true, question: "What does accepting a quotation do?", answer: "It records your decision on that exact version of the quotation. After that you can explicitly confirm an order from it, which records the quotation's stated terms. Accepting or confirming does not take payment or arrange shipping: Finbyn Mart handles neither." },

  { id: "ord-where", category: "orders", order: 10, published: true, question: "Where do I see my orders?", answer: "In Orders in the sidebar, with their status, amount and expected delivery where one is recorded. An order exists only after you confirm one from an accepted quotation, so the list is empty until then." },
  { id: "ord-cancel", category: "orders", order: 20, published: true, question: "Can I ask to cancel an order?", answer: "Before it is dispatched, yes: Request Cancellation on the order. It sends a request only. The order is not cancelled until the supplier agrees." },

  { id: "sup-leads", category: "supplier", order: 10, published: true, question: "Where do suppliers see direct and matching leads?", answer: "In Inquiries & Leads in the supplier portal. A direct inquiry is one a buyer addressed to your company. A matching lead is a requirement or inquiry that matches products your company supplies. You see the request and the buyer's business name, not their e-mail, phone or address. Leads are not guaranteed." },
  { id: "sup-quote", category: "supplier", order: 20, published: true, question: "How do suppliers send a quotation?", answer: "Open the inquiry in the supplier portal and create a quotation from it. You can save drafts and send when ready. A sent quotation is never edited: a change is sent as a new version, and you can withdraw a quotation while the buyer has not decided." },
  { id: "sup-products", category: "supplier", order: 30, published: true, question: "How do product submissions and review work?", answer: "You create a product draft and submit it for review. Only an approved product appears publicly: a draft, or a product waiting for review, is not visible to buyers. A rejected product shows a reason, and you can change it and submit again." },
  { id: "sup-verification", category: "supplier", order: 40, published: true, question: "What does company verification mean?", answer: "Verification is a separate review by Finbyn Mart of business evidence a company submits. Registering, completing your profile, uploading documents or having a product approved does not verify a company. A supplier is shown as verified only after that review has actually been completed." },

  { id: "tech-ticket", category: "technical", order: 10, published: true, question: "How do I report a problem?", answer: "Signed-in buyers and suppliers can raise a support ticket from Support in their account: choose a category, describe the issue and attach screenshots or documents if they help. Your ticket is saved with a reference you can quote. Any reply appears on the ticket; no reply or response time is promised.", links: [{ label: "Buyer support", href: "/buyer/support" }, { label: "Supplier support", href: "/supplier/support" }] },
  { id: "tech-contact", category: "technical", order: 20, published: true, question: "Is there another way to contact Finbyn Mart?", answer: "Yes: the Contact Us form sends a message without a ticket and needs no account. Live chat is not available. Any phone or e-mail channel appears under Still need help only when it has actually been set up.", links: [{ label: "Contact Us", href: "/contact-us" }] },
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
