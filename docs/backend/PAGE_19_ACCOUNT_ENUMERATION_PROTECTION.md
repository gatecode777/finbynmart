# Account enumeration protection

Goal: nobody can tell, from the recovery pages, whether an address has an account, what kind, or in what state.

| Channel | Protection | Test |
|---|---|---|
| Response body | Identical JSON for a registered buyer, a registered supplier, an unregistered address and a suspended account (including `cooldownSeconds` and `validMinutes`) | F-01 compares the full bodies |
| Status code | Always 200 for a well-formed request that passes the limits | F-01 |
| Limits | Depend on the request only (address, email text), never on the account | F-14, F-14b (unknown addresses are limited the same way) |
| Timing | Lookup and email run after the response is sent (`after()`); median 103 ms for a registered address and 105 ms for an unregistered one over five runs each | G-15 |
| "Email not set up" | Depends on server configuration only | A-20 |
| Role | Read from the database record, never accepted from the client, never returned; validation endpoint returns only `{ ok, valid }` | G-06, G-11 |
| Emails | Sent only to the real account holder's address; nothing sent for unknown or suspended | F-02, F-15 |
| UI | Same "Check Your Email" state for any address; never "not found", "was sent" or "delivered" | G-17 |
| Sign-in | Wrong password and unknown email give the same message; account state (unconfirmed, suspended) is revealed only after a correct password | M-08, M-09, A-24, A-25 |

## Known exceptions (stated)

- **Registration** answers 409 "already registered" for an existing address. This is a usability choice, rate limited (10 well-formed registrations per hour per address).
- The timing measurement used five samples per case on one machine; it does not rule out small differences (database latency of the lookup is after the response, but CPU work on the server still differs slightly).
- A determined attacker who controls the target mailbox learns nothing from this system that the mailbox does not already show.
