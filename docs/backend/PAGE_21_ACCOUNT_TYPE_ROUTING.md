# Account type routing

`resolveAccountLoginDestination(role)` in `resetConfirmation.ts`. The role is the one stored on the user when the reset committed (copied into the event). It is never read from the URL, the request body, the cookie or browser state.

| Stored role | Action shown | Destination |
|---|---|---|
| buyer | Sign In as Buyer | `/login/buyer` |
| supplier | Sign In as Supplier | `/login/supplier` |
| missing or unknown | Sign In | `/sign-in` (never a guess) |

`/login/buyer` and `/login/supplier` redirect to the single sign-in page (route aliases, documented, not separate pages). No reset token or query string is put in the link (P21-14). The page does not sign anyone in; fresh authentication with the new password is required (P21-28 to P21-30).

Tested: P21-10, P21-11 (body claiming supplier, page offers only buyer), P21-16, P21-17, P21-19. Multi-role accounts do not exist in the data model, so no multi-role behaviour was built or tested.
