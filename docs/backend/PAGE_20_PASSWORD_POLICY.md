# Password policy (shared by registration and reset)

Source of truth: `src/lib/auth/buyerRegistration.ts` (`checkBuyerPassword`, `PASSWORD_RULES`). The reset route calls the same function as registration; the reset page's checklist is generated from `PASSWORD_RULES`, so what the page shows cannot disagree with the server.

- At least 10 and at most 128 characters (counted as JavaScript string length).
- Not only whitespace.
- Not on a short list of very common passwords (case-insensitive), and not one repeated character.
- No uppercase, lowercase, digit or symbol requirement. (The reference image showed such rows; they were not added because that would be a stricter policy than registration.)
- Confirmation must match exactly, checked in the browser and again on the server. It is never stored.
- The password is never trimmed, normalised or truncated: leading and trailing spaces, accents and emoji are kept exactly (tested: sign-in works with the exact text and fails with the trimmed text).

Hashing: the existing `hashPassword` (scrypt, 16-byte random salt, 64-byte key, `salt:hash` hex), unchanged and not weakened; sign-in verifies with `verifyPassword`. Measured hash time at the reset route: 40-73 ms median.

Tested: H-26 to H-33, H-13, H-18, H-47.
