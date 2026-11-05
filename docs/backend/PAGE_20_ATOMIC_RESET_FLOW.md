# Atomic reset flow

Code: `src/lib/auth/passwordReset.ts` (`resetPasswordWithToken`). MongoDB Atlas supports transactions, so a real transaction is used (`session.withTransaction`).

Before the transaction (cheap, no writes): password rules, token inspection (not VALID returns 400 immediately), scrypt hash.

Inside one transaction:

1. `findOneAndUpdate` on the token with the condition `{ tokenHash, purpose: "reset_password", usedAt: null, revokedAt: null, expiresAt > now }`, setting `usedAt`. If nothing matches the transaction ends with no changes.
2. `findOneAndUpdate` on the user `{ _id, accountStatus != "SUSPENDED" }`: new `passwordHash`, `emailVerified: true`, `passwordChangedAt`, `updatedAt`, and `$inc sessionVersion`. If no user matches (deleted or suspended since the link was sent) the transaction is aborted, which also undoes step 1: the link is not burned.
3. A pending account becomes ACTIVE.
4. Every other unused, unrevoked token of that account gets `revokedAt`.
5. A `security_events` row `{ userId, type: "PASSWORD_RESET", at, ipHash }`.

Guarantees: the password changes if and only if the token was consumed; the same token cannot succeed twice (the conditional update is atomic, so of six simultaneous requests exactly one commits, tested in H-36); other accounts are untouched (H-17). Success is reported only after commit; a failure answers 503 "Nothing was changed". After a non-commit the stored state decides the message (a losing racer sees ALREADY_USED).

Not covered by an automated test: a database failure injected between steps (the driver rolls the transaction back; verified by reading the code, not by fault injection). The deleted and suspended account cases (H-37, H-38) are caught before the transaction by the inspection; the abort path inside the transaction (account vanishing in the milliseconds between inspection and commit) is not exercised by a test.
