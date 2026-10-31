# Missing Assets & Placeholder Data — B2B Homepage

Tracks everything in the current homepage build that is a stand-in and must be replaced with real, approved material before this ships. None of it is wired to production data; see `CLAUDE.md` for the project's anti-fabrication rules.

## Photography

- **Hero visual** (`src/components/homepage/HeroSection`) — reference calls for professional Indian business photography. No licensed image available; currently a navy icon tile. Needs a real photo.
- **Category tiles** (`src/lib/constants/categories.ts`) — all 10 categories render as icon/gradient tiles (`MediaTile` component) instead of photography, since no licensed category photos exist. `MediaTile` already supports a real `imageSrc` — supply one per category and it takes over automatically.
- **Industry tiles** (`src/lib/constants/industries.ts`) — same situation, same fix path.
- **Supplier logos** (`src/lib/constants/suppliers.ts`) — same situation.
- **India network map** (`src/components/homepage/IndiaNetworkBanner`) — spec requires a proper licensed/vector India map graphic. Currently a labeled placeholder box, not a fabricated map shape.
- **App screenshot / phone mockup** (`src/components/homepage/AppPromotion`) — no published Finbyn Kart app exists yet. Placeholder phone shell only; Google Play / App Store buttons are rendered disabled ("Coming Soon"), not linked, since there's nothing to link to.

## Business data

- **Supplier records** (`src/lib/constants/suppliers.ts`) — 6 sample suppliers (Shree Textiles, ABC Engineering Works, etc.) for layout purposes only, per the spec's own "visual development only" allowance. Must be replaced with real supplier records from the backend before launch. None are marked verified in a way that implies real verification — this is sample UI state, not a claim about real businesses.
- **Testimonials** (`src/lib/constants/testimonials.ts`) — deliberately uses generic "Sample Buyer One/Two/Three" placeholders rather than invented realistic names, to avoid fabricating real-looking customer identities. Replace with genuine, customer-approved quotes, or hide the section if none are available at launch — both are explicitly sanctioned by the spec.
- **Marketplace stats** (`src/lib/constants/trust.ts` — `HERO_STATS`, `NETWORK_STATS`) — "10L+ Verified Suppliers", "50L+ Products", "28+ Industries" etc. are the numbers shown in the reference image, not confirmed business figures. Flagged in code comments. Get actual approved marketing numbers before launch.
- **Footer contact details** (`src/components/layout/Footer`) — no real phone/email/address was available (the live finbynkart.com site only had an `example@gmail.com` placeholder, not real contact info). The footer intentionally shows a muted "to be confirmed" note instead of a fabricated phone number or email.

## Functional gaps (expected at this stage)

- **Search** (`src/components/layout/SearchBar`) — client-side only, navigates to `/search?...`; no results page or backend search exists yet.
- **Requirement form** (`src/components/homepage/RequirementBanner/RequirementForm.tsx`) — full client-side validation works, but `submitRequirement` (`src/lib/api/requirements.ts`) is a stub that always returns an honest "not connected to a backend yet" message rather than a fake success state. Wire this up once the real inquiry API is confirmed.
- **Category mega-menu / "More" dropdown** (`src/components/layout/CategoryNavigation`) — renders as plain links today; no open/close dropdown behavior yet.

## Not generated in this pass

The original brief asked for a full documentation suite (`DESIGN_SYSTEM.md`, `RESPONSIVE_QA.md`, `VISUAL_COMPARISON.md`, `ACCESSIBILITY_REPORT.md`, `PERFORMANCE_REPORT.md`). This environment has no browser/Lighthouse/axe tooling to actually produce those results, and writing them with invented scores would be the exact kind of fabrication both briefs explicitly prohibit. `npm run lint`, `npx tsc --noEmit`, and `npm run build` all pass clean (verified), and the homepage was checked at the app-router level (dev server serving 200, all 14 sections present in the rendered HTML) — but real screenshot/Lighthouse QA needs to be run by someone with that tooling, or in a follow-up with browser access.
