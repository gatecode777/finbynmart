/**
 * Privacy Policy content (Page 16): a REVIEWABLE DRAFT describing how the website works TODAY. It is not an approved or legally reviewed policy and claims no legal compliance.
 * Every statement was written from the implementation (evidence table: docs/page-designs/PAGE_16_PRIVACY_POLICY.md). Do not add a fact here without evidence, an invented date,
 * retention period, provider, officer, address or e-mail, or a promise the code does not keep.
 *
 * Publishing: while PRIVACY_POLICY_EFFECTIVE_DATE (YYYY-MM-DD) is unset the page says it is a draft and is kept out of search indexes. The business sets it ONLY after it has approved the text
 * (and after legal review). PRIVACY_POLICY_VERSION and PRIVACY_OPERATOR_NAME are optional and shown only when set; with no operator name the "who operates" section is omitted rather than guessed.
 */
export type Block =
  | { type: "p"; text: string }
  | { type: "h3"; text: string }
  | { type: "ul"; items: string[] }
  | { type: "callout"; title: string; paragraphs: string[] };
export interface PolicySection { id: string; title: string; blocks: Block[] }
export interface PolicyStatus { approved: boolean; effectiveDate: string | null; version: string | null; operator: string | null }

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const clean = (v: string | undefined, max: number) => v?.replace(/[\u0000-\u001f<>]/g, " ").replace(/\s+/g, " ").trim().slice(0, max) || null;

export function policyStatus(env: Record<string, string | undefined> = process.env): PolicyStatus {
  const date = env.PRIVACY_POLICY_EFFECTIVE_DATE?.trim();
  const effectiveDate = date && DAY.test(date) && !Number.isNaN(Date.parse(date)) ? date : null;
  return { approved: effectiveDate !== null, effectiveDate, version: clean(env.PRIVACY_POLICY_VERSION, 40), operator: clean(env.PRIVACY_OPERATOR_NAME, 120) };
}

export const DRAFT_NOTICE = "This policy is a draft. It describes how the website works today and has not yet been reviewed or approved by Finbyn Mart. It is not legal advice.";

export function policySections(status: PolicyStatus): PolicySection[] {
  const sections: PolicySection[] = [
    {
      id: "overview",
      title: "Overview",
      blocks: [
        { type: "p", text: "This page explains how information is handled when you use Finbyn Mart: browsing products and suppliers, creating an account, posting a requirement, sending an inquiry and talking to suppliers. It describes how the website works at present." },
      ],
    },
  ];
  if (status.operator) {
    sections.push({ id: "who-operates", title: "Who operates Finbyn Mart", blocks: [{ type: "p", text: `Finbyn Mart is operated by ${status.operator}.` }] });
  }
  sections.push(
    {
      id: "information-collected",
      title: "Information collected",
      blocks: [
        { type: "p", text: "We collect the information you give us and some information the website needs to run:" },
        {
          type: "ul",
          items: [
            "Account and sign-in: your name, e-mail address, phone number and company name (buyers) or business name and city (suppliers), and your password, which is stored only as a one-way hash. We also keep a record of your sign-in sessions (a device label such as browser and system, and times) and security events such as a password change or repeated failed sign-ins on an existing account.",
            "Business profile: your designation, alternate phone and e-mail, addresses you save, and for suppliers the company profile (business name, type, location, description, website, year established and addresses).",
            "Requirements, inquiries and conversations: what you ask for (product, quantity, delivery location, any required-by date and your message), supplier responses, quotations and orders that follow from them. A guest who sends an inquiry without an account gives a name, contact details and optionally a company name, together with a record that they accepted the terms.",
            "Documents and support: business documents you upload, support tickets and their attachments, and messages sent through the Contact Us form.",
            "Your choices on the site: saved products and suppliers, comparison lists and notification preferences.",
            "Technical information: the cookies and browser storage described below; your network address, used briefly to limit repeated requests; and, when the site is hosted on a platform that provides it, page performance measurements.",
          ],
        },
      ],
    },
    {
      id: "how-used",
      title: "How information is used",
      blocks: [
        { type: "p", text: "We use information to run the marketplace and keep it safe:" },
        {
          type: "ul",
          items: [
            "to create and secure your account and keep you signed in;",
            "to show products and supplier businesses and let you save and compare them;",
            "to deliver your inquiries and requirements to suppliers and let buyers and suppliers exchange responses and quotations (see the next section);",
            "to confirm orders that a buyer chooses to make from an accepted quotation;",
            "to answer support requests and send notices inside the website;",
            "to send account e-mails, such as verification and password reset, when an e-mail service is set up;",
            "to review supplier products and supplier business evidence before they are shown or labelled, and to look after the marketplace and its security.",
          ],
        },
      ],
    },
    {
      id: "requirements-sharing",
      title: "Requirements and supplier sharing",
      blocks: [
        {
          type: "callout",
          title: "How a requirement reaches suppliers",
          paragraphs: [
            "A direct product inquiry from a signed-in buyer goes to the supplier you selected and also to other eligible supplier companies that offer the same product. Matching is part of sending the inquiry; it is not a separate option you can switch on or off.",
            "A General Requirement has no selected supplier. It goes to eligible matching suppliers only, and you must be signed in to post one.",
            "An inquiry sent as a guest goes to the selected supplier only.",
          ],
        },
        { type: "h3", text: "What a supplier can see" },
        {
          type: "ul",
          items: [
            "The product or requirement title, your message exactly as you wrote it, the category, the quantity and unit, the delivery location, the required-by date if you gave one, and the product's listed specifications.",
            "Your business name (or \"Individual buyer\" if you have none), whether you are a registered buyer or a guest, and the reference and time of the inquiry.",
            "The supplier you selected also sees a link to the product page. A matching supplier does not see which supplier you selected or who else received the requirement.",
            "Suppliers do not see your phone number, e-mail address, postal address or account identifier. Anything you type in your message is shown as written, so please do not put personal contact details in it.",
          ],
        },
        { type: "h3", text: "Conversations and quotations" },
        {
          type: "p",
          text: "Responses and quotations are part of the conversation between you and the supplier concerned. Other suppliers and other buyers cannot see them. Finbyn Mart staff with the relevant permission can read inquiries and conversations when they need to operate the marketplace.",
        },
        {
          type: "p",
          text: "Matching suppliers are found by a background process after you submit. This page does not promise that any supplier will receive a requirement, or when.",
        },
      ],
    },
    {
      id: "public-private",
      title: "Public and private information",
      blocks: [
        { type: "p", text: "A supplier's public page shows the business information the supplier provides for it, such as its name, city, description and products, and product images that the supplier uploads." },
        {
          type: "p",
          text: "These stay private to you and the people you deal with: your e-mail address and phone number, your sign-in and security records, saved items, support tickets, conversations, quotations and orders. Uploaded business documents are kept in private storage with no public link and are given only to the account that uploaded them and, where a document is submitted for supplier review or attached to a support request, to staff who are permitted to review it.",
        },
      ],
    },
    {
      id: "service-providers",
      title: "Service providers",
      blocks: [
        { type: "p", text: "Parts of the website are provided with the help of outside services. By category, these are:" },
        {
          type: "ul",
          items: [
            "a cloud database service, where account, inquiry and other records are stored;",
            "an image hosting service for the product images suppliers upload;",
            "an e-mail delivery service, used only for account e-mails when one is configured (it receives the recipient's address and name and a one-time link);",
            "a hosting platform and, where it provides one, a page performance measurement service.",
          ],
        },
        { type: "p", text: "We share information with suppliers as described above. We do not describe provider locations or contract terms on this page." },
      ],
    },
    {
      id: "cookies-storage",
      title: "Cookies and browser storage",
      blocks: [
        { type: "p", text: "The website sets only the cookies it needs to work:" },
        {
          type: "ul",
          items: [
            "a sign-in cookie that keeps you signed in for up to seven days or until you sign out;",
            "for a guest inquiry, a cookie that lets the browser that sent it open its confirmation page for one hour;",
            "during a password reset, a short-lived cookie that confirms the reset.",
          ],
        },
        { type: "p", text: "The website also stores a few things in your browser itself, which are not sent to us:" },
        {
          type: "ul",
          items: [
            "your list or grid view choice for saved items and the supplier menu size (kept until you clear browser data);",
            "while a tab is open: a requirement you were writing before signing in, your support search text and a one-time confirmation message.",
          ],
        },
        { type: "p", text: "The website does not set advertising or analytics cookies." },
      ],
    },
    {
      id: "retention",
      title: "Retention",
      blocks: [
        { type: "p", text: "Some records are removed automatically:" },
        {
          type: "ul",
          items: [
            "sign-in sessions expire after seven days, and their records are removed 30 days after they expire;",
            "one-time e-mail links are removed one day after they expire;",
            "in-site notifications are removed 180 days after they are created;",
            "records used to limit repeated requests expire within about an hour.",
          ],
        },
        {
          type: "p",
          text: "Other records, such as accounts, business profiles, inquiries, conversations, quotations, orders, documents and support tickets, are kept until they are removed on request or by staff; no automatic deletion period applies to them yet. Inquiries sent as a guest are marked to be kept for up to two years, but automatic removal after that is not yet in operation.",
        },
      ],
    },
    {
      id: "privacy-requests",
      title: "Privacy requests",
      blocks: [
        { type: "p", text: "You can update your profile, company details, addresses and notification preferences yourself, review your sign-in sessions, change your password and sign out of other devices." },
        {
          type: "p",
          text: "Exporting your data and deleting your account are not automated yet. To ask for either, or to ask a question about your information, contact us. Nothing is exported or deleted until a person has handled your request. We do not state a response time on this page.",
        },
      ],
    },
    {
      id: "security",
      title: "Security",
      blocks: [
        {
          type: "p",
          text: "We take these steps: passwords are stored as one-way hashes; sign-in uses a cookie that scripts in the browser cannot read, and you can end sessions on other devices; repeated attempts on sign-in and forms are limited; uploaded documents are checked by content and kept in private storage; and staff access to sensitive areas depends on permissions, with sensitive administrative actions recorded. No method of storing or sending information is completely secure, so we cannot guarantee absolute security.",
        },
      ],
    },
    {
      id: "changes-contact",
      title: "Changes and contact",
      blocks: [
        { type: "p", text: "We may update this policy. When a version is approved, its effective date is shown at the top of this page. To reach us about privacy, use the contact details below." },
      ],
    },
  );
  return sections;
}
