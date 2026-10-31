export interface FooterColumn {
  title: string;
  links: { label: string; href: string }[];
}

export const FOOTER_COLUMNS: FooterColumn[] = [
  {
    title: "Quick Links",
    links: [
      { label: "About Us", href: "/about-us" },
      { label: "How It Works", href: "/how-it-works" },
      { label: "Success Stories", href: "/success-stories" },
      { label: "Blog", href: "/blog" },
      { label: "Careers", href: "/careers" },
      { label: "Press & Media", href: "/press" },
    ],
  },
  {
    title: "For Buyers",
    links: [
      { label: "Post Requirement", href: "/post-requirement" },
      { label: "Search Suppliers", href: "/suppliers" },
      { label: "Browse Categories", href: "/categories" },
      { label: "Buyer Guide", href: "/buyer-guide" },
      { label: "Safety Tips", href: "/safety-tips" },
      { label: "FAQs", href: "/faqs" },
    ],
  },
  {
    title: "For Suppliers",
    links: [
      { label: "Register as Supplier", href: "/register-supplier" },
      { label: "Supplier Membership", href: "/supplier-membership" },
      { label: "Lead Management", href: "/lead-management" },
      { label: "Pricing", href: "/pricing" },
      { label: "Supplier Guide", href: "/supplier-guide" },
      { label: "Success Stories", href: "/supplier-success-stories" },
    ],
  },
  {
    title: "Support",
    links: [
      { label: "Help Center", href: "/help" },
      { label: "Contact Us", href: "/contact-us" },
      { label: "Track Inquiry", href: "/track-inquiry" },
      { label: "Report Abuse", href: "/report-abuse" },
      { label: "Feedback", href: "/feedback" },
      { label: "Sitemap", href: "/sitemap" },
    ],
  },
];

export const LEGAL_LINKS = [
  { label: "Terms of Use", href: "/terms-and-conditions" },
  { label: "Privacy Policy", href: "/privacy-policy" },
  { label: "Refund Policy", href: "/refund-policy" },
  { label: "Cookie Policy", href: "/cookie-policy" },
  { label: "Disclaimer", href: "/disclaimer" },
];
