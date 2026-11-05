# Page 22 — Buyer Dashboard (`/buyer/dashboard`)

Design reference: the generated Page 22 image (chat only). Buyer accounts only; an unauthenticated visitor is sent to `/sign-in?next=/buyer/dashboard`, a supplier account sees "Buyer accounts only".

## Shell (reused by every `/buyer` page)

`src/components/buyer/BuyerShell` (client) with `BuyerTopbar` and `BuyerSidebar`. Pages call `requireBuyerPage()` on the server and pass only the display name and the active-inquiry count. **Decision on chrome (CLAUDE.md section D):** the owner's PRD and reference replace the marketplace header and footer inside the buyer workspace, so `SiteChrome` (in the root layout) omits the announcement bar, header, category navigation and footer on `/buyer/*`; every other route is unchanged.

- Top bar: logo, the shared global search, Cart (icon only, "not available yet": no page exists) and the Notifications bell (icon only, a real link with the real unread count since Pages 25-26), profile menu (name; Profile & Company opens `/buyer/profile`; Settings & Notifications opens `/buyer/settings`; Sign out works). RFQ and Saved shortcuts were removed at the owner's request.
- Sidebar: the 12 items of the reference in `buyerNav.ts`. Every item is now a live link (Address Book, Settings & Notifications, My Inquiries, Saved Products, Saved Suppliers, Compare Products, Quotations and Orders); an item without a page would be labelled "Soon" and not be a link, so none can lead to a blank page; give an item its `href` when its page exists. The only badge is My Inquiries, from the real active-inquiry count. Desktop: always minimized to icons (76px) and expanding to 260px over the content while hovered or keyboard-focused, with no toggle button; below 1024px: a drawer (inert when closed, focus moves in, Escape closes and returns focus).

## Content

Title and welcome (first name from the account), period selector (7d, 30d, 90d, this month, previous month, custom) and a Refresh button that re-asks the server. Four KPI cards (only Total Inquiries has data; quotations, orders and order value say "Not available yet" with the reason), Inquiry & Order Trend (SVG line, orders not shown, hidden data table), Top Categories donut, Recent Inquiries (latest five; cards instead of a table on phones), Recent Quotations ("will appear once supplier quotations are connected"), Quick Actions (only the five that have pages), promotional banner (without "verified": nothing is verified), right column: Account Status, Activity Progress, Recommended/Featured Suppliers.

States: every section reports its own error with a Retry (the rest of the page still renders); empty states for no inquiries, no trend data, no categories.
