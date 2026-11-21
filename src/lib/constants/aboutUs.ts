/**
 * About Us content (Page 13). DRAFT POSITIONING COPY: it describes what the product does today (each statement below was checked against a real, built workflow) and is NOT a set of
 * verified company facts. Business approval of the wording is still required (docs/page-designs/PAGE_13_ABOUT_US.md). Nothing here states a founding year, a history, people, locations,
 * counts, certifications, awards, partnerships, testimonials, a guarantee, a response time, verification, payments or shipping, and none may be added without an approved source.
 *
 * Feature scope each statement relies on: product and supplier browsing (/products, /suppliers), Post Your Requirement and the quote forms, the buyer's inquiry and quotation pages,
 * the supplier company profile and public supplier pages, the supplier inquiry inbox and quotation builder.
 */
export const ABOUT_US = {
  title: "About Us",
  heading: "Connecting businesses. Simplifying sourcing.",
  lead: "Discover products, connect with relevant suppliers and discuss your business requirements through Finbyn Mart.",
  heroActions: [
    { label: "Explore Products", href: "/products", variant: "primary" },
    { label: "Find Suppliers", href: "/suppliers", variant: "secondary" },
  ],
  about: {
    heading: "About Finbyn Mart",
    text: "Finbyn Mart is a B2B marketplace designed to help businesses discover products, connect with relevant suppliers and discuss their sourcing requirements.",
  },
  purpose: {
    heading: "Our purpose",
    items: [
      { icon: "search", title: "Easier discovery", text: "Help businesses explore relevant products and suppliers." },
      { icon: "requirements", title: "Clear requirements", text: "Give buyers a structured way to describe what they need." },
      { icon: "conversations", title: "Organized conversations", text: "Help buyers and suppliers keep sourcing discussions together." },
    ],
  },
  audiences: {
    heading: "Built for buyers and suppliers",
    buyers: { heading: "For buyers", items: ["Discover products and supplier businesses.", "Share product requirements.", "Review supplier responses and quotations."] },
    suppliers: { heading: "For suppliers", items: ["Present business information.", "View relevant inquiries.", "Respond to buyers and prepare quotations."] },
  },
  steps: {
    heading: "How sourcing connects",
    items: [
      { icon: "search", title: "Discover", text: "Find a relevant product or supplier." },
      { icon: "conversations", title: "Connect", text: "Share a requirement and discuss the need." },
      { icon: "compare", title: "Compare", text: "Review the responses and quotations received." },
    ],
  },
  cta: {
    heading: "Find the right starting point.",
    actions: [
      { label: "Browse Products", href: "/products", variant: "primary" },
      { label: "Contact Us", href: "/contact-us", variant: "secondary" },
    ],
  },
} as const;

export type AboutIcon = "search" | "requirements" | "conversations" | "compare";
