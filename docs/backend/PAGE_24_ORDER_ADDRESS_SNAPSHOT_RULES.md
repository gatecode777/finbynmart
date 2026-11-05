# Page 24 — Order, quotation and inquiry address snapshot rules

**Status: contract only. No order, checkout, invoice or quotation module exists, so nothing uses it yet (BLOCKED until they do).**

## Rule
Any record that uses an address must store an **immutable copy**, never a reference. `toAddressSnapshot(address)` (`src/lib/buyer/addressRules.ts`) returns label, contact person, company name, normalised phone, lines 1 and 2, landmark, city, state, postal code and country. It carries no address id, buyer id or version, so editing or deleting the saved address later cannot alter a confirmed record. Unit-tested (S-01, S-02).

## Today
Inquiries already follow the rule: choosing a saved address in the inquiry form fills the free-text delivery location with "City, State PIN" (`locationText`) and the inquiry stores only that text. Deleting an address leaves sent inquiries untouched (tested F-04).

## When orders exist
- Snapshot at the moment the buyer confirms; show the snapshot, not the live address, on every later view.
- Replace `isReferencedByActiveRecord` in `addresses.ts` only if a reference is ever kept (for example an unconfirmed draft order); with snapshots, hard delete stays safe.
- Billing address on an invoice must also be a snapshot.
