/**
 * Terms & Conditions content (Page 17): a REVIEWABLE DRAFT that describes how the website works TODAY and proposes the everyday expectations of buyers and suppliers.
 * It is NOT approved or legally reviewed terms and claims no enforceability. Every statement about the software was written from the code (evidence table:
 * docs/page-designs/PAGE_17_TERMS_AND_CONDITIONS.md). Do not add an invented operator, address, e-mail, date, governing law, jurisdiction, arbitration venue, liability cap,
 * indemnity, refund rule, payment or shipping promise, appeal process or enforcement claim. Where a decision is open the text says that a part is not set out yet.
 *
 * Publishing: while TERMS_EFFECTIVE_DATE (YYYY-MM-DD) is unset the page says it is a draft and is kept out of search indexes. The business sets it ONLY after it has approved the text
 * (and after legal review). TERMS_VERSION and TERMS_OPERATOR_NAME are optional and shown only when set; with no operator name the "who operates" section is omitted, never guessed.
 */
import { PRIVACY_PATH } from "@/lib/legal";
import type { Block as PlainBlock, PolicySection as PlainSection } from "./privacyPolicy";

/** A paragraph that ends in an internal link: `before`, the link, `after`. */
export type Block = PlainBlock | { type: "link"; before: string; label: string; href: string; after: string };
export interface TermsSection extends Omit<PlainSection, "blocks"> { blocks: Block[] }
export interface TermsStatus { approved: boolean; effectiveDate: string | null; version: string | null; operator: string | null }

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const clean = (v: string | undefined, max: number) => v?.replace(/[\u0000-\u001f<>]/g, " ").replace(/\s+/g, " ").trim().slice(0, max) || null;

export function termsStatus(env: Record<string, string | undefined> = process.env): TermsStatus {
  const date = env.TERMS_EFFECTIVE_DATE?.trim();
  const effectiveDate = date && DAY.test(date) && !Number.isNaN(Date.parse(date)) ? date : null;
  return { approved: effectiveDate !== null, effectiveDate, version: clean(env.TERMS_VERSION, 40), operator: clean(env.TERMS_OPERATOR_NAME, 120) };
}

export const TERMS_DRAFT_NOTICE = "These terms are a draft. They describe how the website works today and have not yet been reviewed or approved by Finbyn Mart. They are not legal advice.";

export function termsSections(status: TermsStatus): TermsSection[] {
  const sections: TermsSection[] = [
    {
      id: "overview",
      title: "Overview",
      blocks: [
        { type: "p", text: "These terms explain how Finbyn Mart works and what is expected of the people who use it. Finbyn Mart is a B2B marketplace where buyers discover products and suppliers, post requirements, send inquiries, talk with suppliers and receive quotations." },
        { type: "p", text: "Today the website lets buyers and suppliers find each other, exchange messages and quotations, and record an order that a buyer chooses to confirm. It does not collect payments, arrange shipping or process refunds." },
        { type: "p", text: "Viewing this page is not acceptance of these terms." },
      ],
    },
  ];
  if (status.operator) {
    sections.push({ id: "who-operates", title: "Who operates Finbyn Mart", blocks: [{ type: "p", text: `Finbyn Mart is operated by ${status.operator}.` }] });
  }
  sections.push(
    {
      id: "accounts",
      title: "Accounts",
      blocks: [
        { type: "p", text: "To use account features you register as a buyer or as a supplier. An account has one role. The information you give when you register, such as your name, e-mail address, phone number and business details, should be accurate and kept up to date." },
        { type: "p", text: "You are responsible for keeping your password secret and for what happens under your account. If you think someone else has used it, change your password and sign out your other devices from your account settings." },
        { type: "p", text: "When you register you tick a box to agree before the account is created. Rules about who may register, such as age or authority to act for a business, are not set out in this draft yet." },
      ],
    },
    {
      id: "buyer-responsibilities",
      title: "Buyer responsibilities",
      blocks: [
        {
          type: "ul",
          items: [
            "Describe your requirements accurately and completely enough for a supplier to respond.",
            "Read product descriptions and each supplier's response; listings and responses come from suppliers.",
            "Check a quotation's price, currency, unit, quantity, tax and validity date before you accept it.",
            "Use conversations for business purposes and communicate respectfully, and do not put personal contact details in your message.",
          ],
        },
      ],
    },
    {
      id: "supplier-responsibilities",
      title: "Supplier responsibilities",
      blocks: [
        {
          type: "ul",
          items: [
            "Keep your business and product information accurate.",
            "Offer only products you have the right and authority to offer.",
            "Give clear quotation terms: price, currency, unit, quantity and how long the quotation is valid.",
            "Do not mislead buyers about availability, stock or verification.",
          ],
        },
        { type: "p", text: "Finbyn Mart does not promise that every supplier is verified. A verification label is shown only where a review of the business's submitted documents has been completed and the business details still match." },
      ],
    },
    {
      id: "requirements-distribution",
      title: "Requirements and supplier distribution",
      blocks: [
        {
          type: "callout",
          title: "How a requirement reaches suppliers",
          paragraphs: [
            "A direct product inquiry from a signed-in buyer goes to the supplier you selected and also to other eligible supplier companies that offer the same product. This matching is part of sending the inquiry; it is not a separate option you can switch on or off.",
            "A General Requirement has no selected supplier. It goes to eligible matching suppliers only, and you must be signed in to post one.",
            "An inquiry sent as a guest goes to the selected supplier only.",
          ],
        },
        { type: "p", text: "Sending an inquiry or requirement does not guarantee that any supplier will respond, or how many suppliers will receive it. Matching suppliers are found by a background process after you submit." },
        { type: "p", text: "Suppliers who receive your inquiry do not see your phone number, e-mail address, postal address or account identifier. They see what you wrote in your message exactly as you wrote it." },
        { type: "link", before: "How your information is handled, including what a supplier can see, is described in the ", label: "Privacy Policy", href: PRIVACY_PATH, after: "." },
      ],
    },
    {
      id: "conversations-quotations",
      title: "Conversations and quotations",
      blocks: [
        { type: "p", text: "A supplier can respond to an inquiry or requirement and can send a quotation. A conversation is between you and one supplier: other suppliers and other buyers cannot see it. Finbyn Mart staff with the relevant permission can read inquiries and conversations when they need to operate the marketplace. Messages are plain text and cannot be edited or deleted once sent." },
        { type: "h3", text: "How quotations work" },
        {
          type: "ul",
          items: [
            "A supplier prepares a quotation as a draft that you cannot see. You see it once the supplier submits it.",
            "A quotation states a price, currency, unit, quantity and a date until which it is valid. Tax is shown only where the supplier stated it; otherwise the amounts are shown as before tax.",
            "You can accept a quotation, reject it or ask the supplier for a revision. You can accept it only while it is the current version, still valid and waiting for your decision. Only one quotation for an inquiry can be accepted.",
            "A revision is a new version. The earlier version stays as it was until the supplier sends the new one. An accepted quotation never changes.",
            "A quotation that is no longer valid can no longer be accepted. A supplier can withdraw a quotation that is still waiting for your decision.",
          ],
        },
        { type: "p", text: "Accepting a quotation records your decision. It does not by itself create an order or a payment. This draft does not yet say what legal effect accepting a quotation has between buyer and supplier." },
      ],
    },
    {
      id: "orders-transactions",
      title: "Orders and transactions",
      blocks: [
        { type: "p", text: "After you accept a quotation you can choose to confirm an order from it. An order is created only when you confirm it, there is one order for each accepted quotation, and it uses the details of the version you accepted. The supplier is told inside the website." },
        { type: "p", text: "If the supplier records stock for the product on the website, confirming the order sets aside that quantity, and the confirmation is refused when not enough is available." },
        { type: "p", text: "The website does not collect or record payments, arrange shipping, record dispatch or delivery, provide escrow or payment protection, or process refunds, and it has no action for a buyer to cancel an order. Any payment, delivery, return or refund arrangement is outside the website, and this draft does not set one." },
      ],
    },
    {
      id: "acceptable-use",
      title: "Acceptable use",
      blocks: [
        { type: "p", text: "Proposed rules for everyone who uses Finbyn Mart. Do not:" },
        {
          type: "ul",
          items: [
            "pretend to be another person or business, or give a false identity;",
            "commit fraud, or post misleading listings, prices, quotations or verification claims;",
            "send spam or repeated unwanted messages;",
            "access accounts, data or areas of the website you are not allowed to, or interfere with its security or operation;",
            "post illegal content or content that infringes the rights of others.",
          ],
        },
      ],
    },
    {
      id: "content-ip",
      title: "Content and intellectual property",
      blocks: [
        { type: "p", text: "You are responsible for the content you submit, including listings, descriptions, images, documents, requirements and messages. Submit only content you have the right to use and that is accurate." },
        { type: "p", text: "This draft does not yet say what permission you give Finbyn Mart to use your content, who owns the Finbyn Mart name and materials, or how a complaint about infringing content is handled." },
      ],
    },
    {
      id: "moderation",
      title: "Moderation and account restrictions",
      blocks: [
        { type: "p", text: "These features exist on the website today:" },
        {
          type: "ul",
          items: [
            "a product a supplier creates starts as a draft and is shown publicly only after Finbyn Mart staff have reviewed and approved it;",
            "staff can reject a submitted product, and can later unpublish a published one;",
            "staff can suspend a supplier company, which stops it receiving new inquiries and limits the supplier pages it can use;",
            "an account can be marked suspended, and a suspended account cannot sign in.",
          ],
        },
        { type: "p", text: "A supplier is told about a product decision or a company restriction by a notice inside the website, which does not include internal reasons. This draft does not say when these features will be used and does not describe an appeal process." },
      ],
    },
    {
      id: "disputes-liability",
      title: "Disputes, liability and governing terms",
      blocks: [
        { type: "p", text: "The website has no feature for resolving disputes between buyers and suppliers. You can raise a support ticket or contact us, but no outcome or response time is promised." },
        { type: "p", text: "This draft does not yet say which law applies, where disputes are heard, or any limit on responsibility. Those parts are to be added only once approved." },
      ],
    },
    {
      id: "changes-contact",
      title: "Changes and contact",
      blocks: [
        { type: "p", text: "These terms may be updated. When a version is approved, its effective date is shown at the top of this page. To reach us about these terms, use the contact details below." },
      ],
    },
  );
  return sections;
}
