/**
 * Footer information pages (docs/page-reports/FOOTER_SMALL_PAGES_COMPLETION.md): one typed source, rendered by `InfoPageView` through the `[page]` route.
 * Every statement about the software was written from the code and the shared sources (`faq.ts`, `howItWorksContent.ts`, Terms and Privacy drafts).
 * "empty" pages are finished editorial pages with an honest no-content state; "legal-draft" pages are REVIEW DRAFTS (noindex, no effective date, not approved).
 * Do not add an invented plan, price, fee, story, customer, vacancy, article, author, date, press item, media contact, refund rule, liability cap or governing law.
 * A page that states a data-handling fact (cookies, storage) must stay equal to `privacyPolicy.ts`.
 */
import type { Block } from "./termsContent";

export interface InfoSection { id: string; title: string; blocks: Block[] }
/** A CTA may point at a private page: the page's own guard sends a signed-out visitor to sign-in and back, so this static page needs no session. */
export interface InfoCta { label: string; href: string }
export interface InfoPage {
  slug: string;
  title: string;
  description: string;
  lead: string;
  kind: "guide" | "empty" | "legal-draft";
  index: boolean;
  sections: InfoSection[];
  ctaTitle: string;
  ctaText: string;
  ctas: InfoCta[];
}

export const LEGAL_DRAFT_NOTICE =
  "Review draft. This text describes how the website works today. It has not been approved by the business or reviewed by a lawyer, and it has no effective date.";

const p = (text: string): Block => ({ type: "p", text });
const ul = (...items: string[]): Block => ({ type: "ul", items });
const link = (before: string, label: string, href: string, after = "."): Block => ({ type: "link", before, label, href, after });
const note = (title: string, ...paragraphs: string[]): Block => ({ type: "callout", title, paragraphs });

const CONTACT: InfoCta = { label: "Contact Us", href: "/contact-us" };

export const INFO_PAGES: InfoPage[] = [
  {
    slug: "buyer-guide",
    title: "Buyer Guide",
    description: "How buyers find products and suppliers on Finbyn Mart, send inquiries or post a requirement, and review quotations and orders.",
    lead: "A practical walk through what a buyer can do on Finbyn Mart today.",
    kind: "guide",
    index: true,
    sections: [
      {
        id: "discover",
        title: "Find products and suppliers",
        blocks: [
          p("Browse by category or industry, search for a product, or look through the supplier list. These public pages need no account."),
          link("Browse ", "All Categories", "/categories", "."),
          link("See the full ", "product list", "/products", "."),
          link("Look through ", "suppliers", "/suppliers", ". Use the filters on a list to narrow it, and open a product or supplier page for details."),
          p("Check what a listing actually states: specifications, quantity or price information and the supplier's profile. Information is shown as the listing provides it, so confirm anything important with the supplier."),
        ],
      },
      {
        id: "two-ways",
        title: "Two ways to say what you need",
        blocks: [
          p("Direct inquiry: on a product or supplier page, send an inquiry to the supplier you chose. You can do this signed in or as a guest."),
          p("Post Requirement: choose the catalogue product that best describes your need, add the quantity and your city, and post it. This needs a buyer account. Some categories also ask for details such as material, colour or size; only the fields the form shows are supported."),
          note("Who sees a requirement", "A requirement is not sent to every supplier. Finbyn Mart matches it, by fixed rules, to active supplier companies that offer the same listing (same category and name, and the same colour when you state one). Suppliers that do not match do not receive it, and a match is not a promise that anyone will reply."),
          link("Post a requirement on the ", "Post Requirement page", "/post-requirement", "."),
        ],
      },
      {
        id: "responses",
        title: "Responses and conversations",
        blocks: [
          p("Replies to an inquiry appear in My Inquiries after you sign in, in a conversation with that supplier. Conversations are private to you and that supplier. Suppliers do not receive your e-mail address, phone number or street address."),
          p("There is no promise that a supplier will answer, or answer within a time."),
        ],
      },
      {
        id: "quotations",
        title: "Quotations and orders",
        blocks: [
          p("A supplier can send a quotation. You can compare versions of it, accept it, reject it or ask for a revision. Amounts shown are the ones the supplier sent."),
          p("Accepting a quotation records your decision only. An order is created only when you then choose to confirm it, one order for each accepted quotation, with the accepted details."),
          p("Finbyn Mart does not collect or process payments, arrange shipping or handle refunds. Agree payment, delivery and returns directly with the supplier, and read the Safety Tips."),
        ],
      },
    ],
    ctaTitle: "Ready to start?",
    ctaText: "Browse products or tell suppliers what you need.",
    ctas: [{ label: "Post Requirement", href: "/post-requirement" }, { label: "Browse categories", href: "/categories" }, { label: "Safety Tips", href: "/safety-tips" }],
  },
  {
    slug: "supplier-guide",
    title: "Supplier Guide",
    description: "How suppliers register on Finbyn Mart, build a company profile, submit products for review, receive leads, reply and send quotations.",
    lead: "What a supplier can do on Finbyn Mart today, and what each step does and does not mean.",
    kind: "guide",
    index: true,
    sections: [
      {
        id: "register",
        title: "Register and set up",
        blocks: [
          link("Create a supplier account on ", "Register as Supplier", "/register-supplier", ". Confirm your e-mail address with the link sent to you, then complete your company profile in the supplier portal."),
          p("Phone verification is not available."),
        ],
      },
      {
        id: "three-things",
        title: "Profile, verification and product approval are different",
        blocks: [
          ul(
            "Profile completion: how much of your company details you have filled in. It is not verification.",
            "Company verification: a review by Finbyn Mart of business evidence you submit. It is shown only after it is approved, and uploading documents alone does not verify a company.",
            "Product approval: a separate review of each product you submit. A product is public only after it is approved.",
          ),
          p("None of the three guarantees another. A complete profile does not verify a company, and a verified company's products still need their own approval."),
        ],
      },
      {
        id: "products",
        title: "Products",
        blocks: [
          p("Products start as drafts that only you can see. When a draft is ready, submit that exact version for review. While it is in review it cannot be edited, and you can withdraw it to make changes. An approved product becomes visible in the marketplace; a rejected one comes back with a reason from a fixed list."),
        ],
      },
      {
        id: "leads",
        title: "Leads, conversations and quotations",
        blocks: [
          link("Inquiries addressed to your company, and requirements matched to your listings, appear in your inbox. See ", "Lead Management", "/lead-management", " for how they arrive."),
          p("You can reply to a buyer in a private conversation and send a quotation. The system calculates the amounts from the lines you enter. A quotation is a version: revising it creates a new version, and you can withdraw one that is still waiting for the buyer."),
        ],
      },
      {
        id: "orders",
        title: "Orders",
        blocks: [
          p("When a buyer confirms an order from an accepted quotation, you can see it in your orders list. The orders pages are view-only. Payment status is not available."),
        ],
      },
    ],
    ctaTitle: "Start as a supplier",
    ctaText: "Register, or sign in to open your supplier portal.",
    ctas: [{ label: "Register as Supplier", href: "/register-supplier" }, { label: "Supplier dashboard", href: "/supplier/dashboard" }],
  },
  {
    slug: "safety-tips",
    title: "Safety Tips",
    description: "Practical tips for staying safe when you buy or sell on Finbyn Mart: checking information, protecting your account and raising concerns.",
    lead: "Sensible habits for anyone doing business through an online marketplace.",
    kind: "guide",
    index: true,
    sections: [
      {
        id: "before-you-deal",
        title: "Before you deal",
        blocks: [
          ul(
            "Read the business and product information carefully and look for details that do not fit together.",
            "Confirm specifications, quantities, prices, taxes, delivery and payment terms in writing before you rely on them.",
            "Ask the other side for what you need to be comfortable. Information on a listing is provided by the seller.",
          ),
        ],
      },
      {
        id: "your-account",
        title: "Protect your account",
        blocks: [
          ul(
            "Use a password you use nowhere else, and never share it.",
            "Never share a one-time code or password with anyone, including someone who says they are from Finbyn Mart.",
            "Sign out on shared computers. In your security settings you can sign out of other devices.",
          ),
        ],
      },
      {
        id: "payments-links",
        title: "Payments and links",
        blocks: [
          ul(
            "Treat unexpected links, attachments and requests to pay in a hurry with care. Check where a link goes before you open it.",
            "Be cautious about paying in advance to someone you cannot check.",
          ),
          note("What Finbyn Mart does not do", "Finbyn Mart does not guarantee any transaction, does not verify every supplier, and does not provide escrow or payment protection. Payment, delivery and returns are arranged between buyer and supplier outside the website."),
        ],
      },
      {
        id: "raise-concern",
        title: "If something looks wrong",
        blocks: [link("Tell us through ", "Report Abuse", "/report-abuse", ". No response time or outcome is promised.")],
      },
    ],
    ctaTitle: "Need to raise a concern?",
    ctaText: "Send a message and describe what happened.",
    ctas: [{ label: "Report Abuse", href: "/report-abuse" }, CONTACT],
  },
  {
    slug: "lead-management",
    title: "Lead Management",
    description: "How suppliers receive and handle buyer inquiries and matched requirements on Finbyn Mart.",
    lead: "An overview of the lead workflow that already exists in the supplier portal.",
    kind: "guide",
    index: true,
    sections: [
      {
        id: "how-leads-arrive",
        title: "How leads arrive",
        blocks: [
          ul(
            "Direct: a buyer sends an inquiry from one of your products or your profile. It is addressed to you.",
            "Matched: when a registered buyer sends an inquiry or posts a requirement for a catalogue product, other active supplier companies that offer the exact same listing (same category, name and, when stated, colour) can receive it as well.",
          ),
          p("Guests' inquiries and sample listings are not distributed. A match is not a recommendation of any supplier, and matched leads show less buyer detail than direct ones."),
        ],
      },
      {
        id: "inbox",
        title: "In your inbox",
        blocks: [
          p("Open an inquiry to read the buyer's need, reply in a private conversation, ask for clarification or send a quotation. Your reply or quotation moves the status of your own lead only."),
          p("There is no read receipt, delivery status or guarantee of a response from the buyer."),
        ],
      },
      {
        id: "limits",
        title: "Limits",
        blocks: [p("Matching runs by fixed rules and can take time. This page does not promise a number of leads or a result. Buyers' e-mail, phone and address are never shown to matched suppliers.")],
      },
    ],
    ctaTitle: "See your leads",
    ctaText: "Sign in to your supplier inbox, or register a supplier account.",
    ctas: [{ label: "Open supplier inbox", href: "/supplier/inquiries" }, { label: "Register as Supplier", href: "/register-supplier" }],
  },
  {
    slug: "supplier-membership",
    title: "Supplier Membership",
    description: "What supplier access on Finbyn Mart includes today. Membership plans are not published.",
    lead: "Membership plans and their details have not been published.",
    kind: "guide",
    index: true,
    sections: [
      {
        id: "published",
        title: "What is published",
        blocks: [
          p("No membership plans, plan names, prices, fees or plan benefits are published. This page does not say that supplier access is, or will stay, free or paid."),
          p("There is no checkout, billing, subscription or paid lead credit on the website."),
        ],
      },
      {
        id: "today",
        title: "What a supplier account can do today",
        blocks: [
          ul("Create a company profile and submit documents for review.", "Submit products for review.", "Receive inquiries and matched requirements, reply and send quotations.", "See orders that buyers confirm."),
          link("The ", "Supplier Guide", "/supplier-guide", " explains each of these."),
        ],
      },
    ],
    ctaTitle: "Questions about membership?",
    ctaText: "Ask us directly, or register to see what the supplier portal offers.",
    ctas: [{ label: "Register as Supplier", href: "/register-supplier" }, CONTACT],
  },
  {
    slug: "pricing",
    title: "Pricing",
    description: "Finbyn Mart pricing information. No supplier or buyer pricing is published.",
    lead: "No pricing has been published.",
    kind: "guide",
    index: true,
    sections: [
      {
        id: "pricing",
        title: "What this means",
        blocks: [
          p("Finbyn Mart has not published prices, fees, commissions or plans for buyers or suppliers, and this page does not promise that any part of the service is free or paid."),
          p("Prices shown on product listings are set by the listing and are not Finbyn Mart's own pricing. Confirm a price and its terms with the supplier."),
          link("See also ", "Supplier Membership", "/supplier-membership", "."),
        ],
      },
    ],
    ctaTitle: "Need to know more?",
    ctaText: "Contact us with a question about pricing.",
    ctas: [CONTACT, { label: "Register as Supplier", href: "/register-supplier" }],
  },
  {
    slug: "track-inquiry",
    title: "Track Inquiry",
    description: "How to follow your inquiries and the replies to them on Finbyn Mart.",
    lead: "Inquiry tracking is private to the buyer who sent the inquiry.",
    kind: "guide",
    index: true,
    sections: [
      {
        id: "how",
        title: "Where to follow an inquiry",
        blocks: [
          p("Sign in to your buyer account and open My Inquiries. You can see each inquiry's status, the supplier's replies and any quotations."),
          p("An inquiry cannot be looked up by its reference number alone, because inquiries contain private business details. Nothing about an inquiry is shown to a visitor who is not signed in."),
          p("If you sent an inquiry as a guest, the confirmation page opened in the same browser for a short time after sending; later replies can only be followed from a buyer account."),
        ],
      },
    ],
    ctaTitle: "Open your inquiries",
    ctaText: "You will be asked to sign in first, then taken to My Inquiries.",
    ctas: [{ label: "My Inquiries", href: "/buyer/inquiries" }, { label: "Create a buyer account", href: "/sign-up" }],
  },
  {
    slug: "report-abuse",
    title: "Report Abuse",
    description: "How to tell Finbyn Mart about a listing, message or account that looks fraudulent or abusive.",
    lead: "Tell us about something that looks wrong. This page explains what to include.",
    kind: "guide",
    index: true,
    sections: [
      {
        id: "what",
        title: "What to include",
        blocks: [
          ul("What happened and where: the product, supplier or conversation involved.", "The page address or reference, if you have it.", "Why it looks fraudulent or abusive."),
          p("Do not include your password or a one-time code."),
        ],
      },
      {
        id: "how",
        title: "How to report",
        blocks: [
          p("Use the Contact Us form with the topic already set to reporting a problem. Your message is saved when you send it and you receive a reference. There is no separate abuse form."),
          p("We do not state a response time, and this page does not describe a moderation or enforcement process."),
        ],
      },
    ],
    ctaTitle: "Send a report",
    ctaText: "The Contact Us form opens with the topic Report a problem.",
    ctas: [{ label: "Report a problem", href: "/contact-us?topic=REPORT_PROBLEM" }, { label: "Safety Tips", href: "/safety-tips" }],
  },
  {
    slug: "feedback",
    title: "Feedback",
    description: "Send feedback or a suggestion about Finbyn Mart.",
    lead: "Tell us what works and what does not.",
    kind: "guide",
    index: true,
    sections: [
      {
        id: "how",
        title: "How to send feedback",
        blocks: [
          p("Use the Contact Us form with the topic already set to feedback. Your message is saved when you send it and you receive a reference. There is no separate feedback form."),
          p("We read feedback to improve the site, but we cannot promise a reply or that a suggestion will be built. For help with an account or inquiry, use the Help Center."),
        ],
      },
    ],
    ctaTitle: "Share your feedback",
    ctaText: "The Contact Us form opens with the topic Feedback or suggestion.",
    ctas: [{ label: "Send feedback", href: "/contact-us?topic=FEEDBACK" }, { label: "Help Center", href: "/help" }],
  },
  {
    slug: "success-stories",
    title: "Success Stories",
    description: "Success stories from buyers and suppliers on Finbyn Mart. None are published yet.",
    lead: "This section is for real stories from businesses that used Finbyn Mart.",
    kind: "empty",
    index: false,
    sections: [
      { id: "status", title: "No stories published yet", blocks: [p("We publish a story only with the written approval of the business it is about, using the facts they supply. None has been published, so nothing is shown here."), link("Meanwhile, see ", "How It Works", "/how-it-works", ".")] },
    ],
    ctaTitle: "Share your business story",
    ctaText: "If Finbyn Mart helped your business, tell us through Contact Us.",
    ctas: [CONTACT],
  },
  {
    slug: "supplier-success-stories",
    title: "Supplier Success Stories",
    description: "Success stories from suppliers on Finbyn Mart. None are published yet.",
    lead: "This section is for real stories from suppliers that sell through Finbyn Mart.",
    kind: "empty",
    index: false,
    sections: [
      { id: "status", title: "No supplier stories published yet", blocks: [p("We publish a supplier's story only with their written approval and the facts they supply. None has been published, so nothing is shown here."), link("To get started, read the ", "Supplier Guide", "/supplier-guide", ".")] },
    ],
    ctaTitle: "Share your story",
    ctaText: "Are you a supplier on Finbyn Mart? Tell us through Contact Us.",
    ctas: [CONTACT, { label: "Register as Supplier", href: "/register-supplier" }],
  },
  {
    slug: "blog",
    title: "Blog",
    description: "The Finbyn Mart blog. No articles are published yet.",
    lead: "Articles for buyers and suppliers will appear here once they are published.",
    kind: "empty",
    index: false,
    sections: [
      {
        id: "status",
        title: "No articles published yet",
        blocks: [
          p("There are no blog articles at the moment."),
          p("These existing guides are not blog articles, but they may help:"),
          link("", "Buyer Guide", "/buyer-guide", ""),
          link("", "Supplier Guide", "/supplier-guide", ""),
          link("", "How It Works", "/how-it-works", ""),
          link("", "Help Center", "/help", ""),
        ],
      },
    ],
    ctaTitle: "Have a topic in mind?",
    ctaText: "Suggest one through Feedback.",
    ctas: [{ label: "Feedback", href: "/feedback" }],
  },
  {
    slug: "careers",
    title: "Careers",
    description: "Careers at Finbyn Mart. No openings are published on this page.",
    lead: "Open roles will be listed here when they are published.",
    kind: "empty",
    index: false,
    sections: [{ id: "status", title: "No openings published", blocks: [p("No job openings are currently published on this page. There is no application address or process here.")] }],
    ctaTitle: "Questions?",
    ctaText: "You can write to us through Contact Us.",
    ctas: [CONTACT],
  },
  {
    slug: "press",
    title: "Press & Media",
    description: "Press and media information for Finbyn Mart.",
    lead: "Information for journalists and media.",
    kind: "empty",
    index: false,
    sections: [
      {
        id: "about",
        title: "About Finbyn Mart",
        blocks: [p("Finbyn Mart is an Indian B2B marketplace where buyers find products and suppliers, share what they need and discuss quotations with suppliers."), link("Read more on ", "About Us", "/about-us", ".")],
      },
      { id: "status", title: "No press materials published", blocks: [p("No press releases, coverage, awards, logos kits or media contact are published on this page.")] },
    ],
    ctaTitle: "Media enquiries",
    ctaText: "Write to us through Contact Us.",
    ctas: [CONTACT],
  },
  {
    slug: "refund-policy",
    title: "Refund Policy",
    description: "Refund Policy for Finbyn Mart (review draft).",
    lead: "What the website does today about payments and refunds.",
    kind: "legal-draft",
    index: false,
    sections: [
      {
        id: "today",
        title: "What the website does today",
        blocks: [
          p("The website does not collect or record payments, arrange shipping or process refunds. Any payment, delivery, return or refund is agreed between the buyer and the supplier outside the website."),
          p("Finbyn Mart does not provide escrow or payment protection."),
          link("See the ", "Terms & Conditions", "/terms-and-conditions", " draft."),
          link("Also read the ", "Safety Tips", "/safety-tips", "."),
        ],
      },
      {
        id: "open",
        title: "Decisions not made yet",
        blocks: [
          p("No refund rule, eligibility condition, time limit or process has been set. These business decisions are open:"),
          ul("Whether Finbyn Mart will ever collect payments or fees.", "Whether any refund will be offered, and under what conditions.", "Who decides a dispute between a buyer and a supplier, if anyone."),
        ],
      },
    ],
    ctaTitle: "Questions about a payment?",
    ctaText: "Raise it with the supplier first; you can also write to us.",
    ctas: [CONTACT, { label: "Help Center", href: "/help" }],
  },
  {
    slug: "cookie-policy",
    title: "Cookie Policy",
    description: "The cookies and browser storage the Finbyn Mart website uses (review draft).",
    lead: "What the website stores in your browser, and why.",
    kind: "legal-draft",
    index: false,
    sections: [
      {
        id: "cookies",
        title: "Cookies",
        blocks: [
          p("The website sets only the cookies it needs to work:"),
          ul("a sign-in cookie that keeps you signed in for up to seven days or until you sign out;", "for a guest inquiry, a cookie that lets the browser that sent it open its confirmation page for one hour;", "during a password reset, a short-lived cookie that confirms the reset."),
          p("The website does not set advertising or analytics cookies, and it has no cookie consent banner because it sets no optional cookies."),
        ],
      },
      {
        id: "storage",
        title: "Browser storage",
        blocks: [
          p("A few things are kept in your browser itself and are not sent to us:"),
          ul("your list or grid view choice for saved items and the supplier menu size (kept until you clear browser data);", "while a tab is open: a requirement you were writing before signing in, your support search text and a one-time confirmation message."),
        ],
      },
      {
        id: "performance",
        title: "Page performance",
        blocks: [p("When the site is hosted on a platform that provides it, page performance may be measured. This is described in the Privacy Policy."), link("See the ", "Privacy Policy", "/privacy-policy", ".")],
      },
    ],
    ctaTitle: "Questions about cookies?",
    ctaText: "Write to us through Contact Us.",
    ctas: [CONTACT, { label: "Privacy Policy", href: "/privacy-policy" }],
  },
  {
    slug: "disclaimer",
    title: "Disclaimer",
    description: "Disclaimer for Finbyn Mart (review draft).",
    lead: "What you should keep in mind when you use the marketplace.",
    kind: "legal-draft",
    index: false,
    sections: [
      {
        id: "information",
        title: "Information on the website",
        blocks: [
          p("Products, suppliers, specifications and prices are shown as the listing provides them. Some catalogue data is indicative or estimated. Confirm anything you rely on with the supplier."),
          p("Finbyn Mart does not state that a supplier is verified unless the page says so, and does not guarantee a transaction, a reply, a quotation or a result."),
        ],
      },
      {
        id: "dealings",
        title: "Dealings between buyers and suppliers",
        blocks: [
          p("Buyers and suppliers deal with each other. Payment, delivery and returns are not handled by the website."),
          link("Read the ", "Safety Tips", "/safety-tips", "."),
          link("See the ", "Terms & Conditions", "/terms-and-conditions", " draft."),
        ],
      },
      {
        id: "open",
        title: "Decisions not made yet",
        blocks: [p("No liability limit, indemnity, governing law or jurisdiction has been set. These need business and legal decisions before this page can be approved.")],
      },
    ],
    ctaTitle: "Questions?",
    ctaText: "Write to us through Contact Us.",
    ctas: [CONTACT],
  },
];

export const INFO_PAGE_MAP = new Map(INFO_PAGES.map((page) => [page.slug, page]));
