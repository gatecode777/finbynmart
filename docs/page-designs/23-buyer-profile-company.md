# Page 23 — Buyer Profile & Company (`/buyer/profile`)

Buyer accounts only, inside the shared buyer shell (Page 22). Design reference: the generated Page 23 image (chat only).

**Layout:** page title and description; summary card (initials avatar, name, designation, company, "Buyer Account", email and mobile with Confirmed / Not confirmed badges taken from the stored flags); Profile Completion card (percentage, progress bar, links to what is still to do); five section links (`?tab=personal|company|documents|verification|security`, a real link each, the current one has `aria-current`; an unknown tab falls back to Personal Details; a row that scrolls sideways inside itself on phones); the open section on the left and, for Personal and Verification, Account Verification and Next Steps on the right (below on narrow screens).

**Personal Details:** Full Name, Designation, Alternate Mobile (optional, country code), Alternate Email (optional); the primary mobile number and email are shown read-only with their state and the reason they cannot be edited here. Save Changes and Cancel, "You have unsaved changes", inline errors, a confirmation only after the server saved it. **Left out on purpose:** date of birth and gender (the PRD allows them only with an approved business need; there is none), profile photograph (no image pipeline or ImageKit exists; initials are shown).

**Company Details:** create form when there is no company (the registration name is only offered as a suggestion; nothing is saved until Save Company), edit form afterwards: legal and display name, business type (approved list), industry, description, website, year established, company email, country, state, city, PIN or postal code (Indian PIN rule only for India), registered and operating address. The verification state is shown and cannot be edited.

**Documents:** the six accepted types with status (Not submitted, Pending review, Verified, Rejected, Expired, Resubmission required), file name, size, dates, expiry, and the rejection reason (to the owner only). Upload and Replace with real progress, View (private route, new tab), Remove (confirmation dialog, Escape cancels). Honest notes: PDF/JPG/PNG up to 5 MB, stored privately, no review process yet so documents stay Pending, storage not configured shows "uploads are unavailable".

**Verification:** four separate cards (Email, Mobile, Company, Documents); one action, "Send a new confirmation link", shown only when email sending exists. **Security:** status, last sign-in, last password change, "devices not available" note, and Change Password (current, new with strength meter, confirm).

Responsive: single column below 640px, tab row scrolls inside itself, no horizontal overflow at 320-2560 px.
