# Page 36 — FAQ rules

Source: `src/lib/support/faq.ts` (`FAQS`, `getPublishedFaqs`, `getFaqCategories`). Repo-managed content with a `published` flag; changing an answer is a reviewed code change until an admin-managed source exists (BLOCKED: no admin).

Rules
- Only items with `published: true` are served; the flag is never exposed.
- Answers describe **how to use features that exist today** (where to find inquiries, orders, quotations; how to save/compare; how to change a password or company details; how to raise a ticket). No answer states a payment method, fee, refund or return window, delivery time, response-time promise or availability that the site cannot honour.
- Categories: account, products, suppliers, inquiries, quotations, orders, technical. There are no Payments, Delivery or Returns categories because no such policy or feature exists. A category appears only if it has at least one published item.
- Unit test F-04 and integration test G-03 fail the build of the suite if an answer contains policy-like phrases (refund/return windows, "N hours/days", fees, guarantees, 24/7, payment options).
- Search is case-insensitive over question and answer (max 60 characters); category filter must be a known category, otherwise 400.
