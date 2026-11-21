/**
 * How It Works (Page 12): typed, static, server-rendered copy. Every statement below is mapped to the code that implements it in docs/page-designs/PAGE_12_HOW_IT_WORKS_COMPLETION.md.
 * Draft wording awaiting business approval. Never add a statement about payment, shipping, response times, guaranteed leads, verification or rankings: none of these exist.
 */
export interface Step { title: string; body: string }
export interface Cta { label: string; href: string }

export const HOW_IT_WORKS_PAGE = {
  title: "How Finbyn Mart Works",
  subtitle: "Finbyn Mart helps buyers find products and suppliers, share what they need and discuss quotations with suppliers. This is what each side can do today.",

  buyers: {
    heading: "For Buyers",
    steps: [
      { title: "Discover", body: "Search or browse products, categories, industries and suppliers. These public pages need no account." },
      { title: "Share what you need", body: "There are two ways. Send an inquiry from a product or supplier page to the supplier you choose, as a signed-in buyer or as a guest. Or use Post Requirement: choose the catalogue product that best describes your need, add the quantity and your city, and post it. Posting a requirement needs a buyer account." },
      { title: "Review responses", body: "Suppliers can reply to your inquiry or send a quotation. You find them in your buyer account under My Inquiries and Quotations. Whether a supplier responds, and when, is up to the supplier." },
      { title: "Discuss and compare", body: "Each supplier has its own private conversation with you. Read each quotation's stated price, terms and validity yourself. If a supplier revises a quotation you can compare its versions. Prices in different currencies are never added up or ranked." },
      { title: "Next steps", body: "You can accept a quotation, decline it or ask for a revision. After accepting, you can confirm an order from it; the order records the quotation's stated terms. Confirming an order does not take payment or arrange shipping: Finbyn Mart does not handle either." },
    ] as Step[],
  },

  distribution: {
    heading: "Who receives your inquiry or requirement",
    items: [
      { title: "A direct inquiry", body: "It goes to the supplier you selected. When you are signed in as a buyer and the inquiry is about a catalogue product, it is also shared with other active suppliers that offer the same product: same category, same product name and, where the product states one, the same colour. An inquiry sent as a guest goes only to the supplier you selected." },
      { title: "A general requirement", body: "No supplier is selected. It is shared with active suppliers whose products match the product you chose. It is not sent to every supplier on Finbyn Mart. You must choose a product from the list: a requirement written only in free text cannot be posted or matched yet." },
      { title: "It is part of sending", body: "Sharing with matching suppliers happens whenever you send these. There is no setting to switch it off." },
      { title: "What suppliers see", body: "Suppliers do not receive your e-mail address, phone number or address through Finbyn Mart. Text you type yourself, such as a message or description, is shown to them as written, so keep contact details out of it." },
      { title: "Timing", body: "Sharing with matching suppliers is processed after you submit. It is not instant and no timing is promised. Suppliers decide whether to respond, and no minimum number of responses is guaranteed." },
    ] as Step[],
  },

  suppliers: {
    heading: "For Suppliers",
    steps: [
      { title: "Register", body: "Create a supplier account and add your company information. Registering does not verify your business." },
      { title: "List products", body: "Create product drafts and submit them for review. Only approved products appear publicly; a draft, or a product waiting for review, is not visible to buyers. Approving a product is not the same as verifying your company." },
      { title: "Receive inquiries", body: "Inquiries addressed to your company, and requirements that match products you supply, appear in Inquiries & Leads. Leads are not guaranteed." },
      { title: "Respond and quote", body: "Reply privately to the buyer and send quotations. The buyer decides whether to accept, decline or ask for a revision." },
      { title: "Orders", body: "When a buyer confirms an order from an accepted quotation, you can see it in your Orders. Orders are view-only for now: payment, dispatch and delivery are not handled on Finbyn Mart." },
    ] as Step[],
  },

  goodToKnow: {
    heading: "Good to know",
    items: [
      "Finbyn Mart does not rank suppliers or recommend a best offer.",
      "Prices shown on listings can be estimates. A quotation shows what the supplier actually offers.",
      "Finbyn Mart does not process payments or arrange shipping.",
      "Suppliers are not shown as verified unless a verification has actually been completed.",
    ],
  },

  cta: {
    heading: "Ready to start?",
    primary: { label: "Post Your Requirement", href: "/post-requirement" } as Cta,
    explore: [{ label: "Browse Products", href: "/products" }, { label: "Find Suppliers", href: "/suppliers" }] as Cta[],
    account: [{ label: "Sign Up as Buyer", href: "/sign-up" }, { label: "Register as Supplier", href: "/register-supplier" }, { label: "Sign In", href: "/sign-in" }] as Cta[],
    help: { label: "Contact Us", href: "/contact-us" } as Cta,
  },
};
