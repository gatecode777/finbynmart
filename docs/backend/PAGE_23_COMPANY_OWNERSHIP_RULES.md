# Company ownership rules

- **One owner.** A company belongs to exactly one buyer (`ownerUserId`, unique). There is no membership or role model, so no one else can read or edit it. The owner is always the signed-in buyer from the session; `ownerUserId`, `companyId`, `buyerId` or `userId` in a request is refused (400).
- **One company per buyer.** A second create answers 409 `HAS_COMPANY`.
- **No claiming.** The legal name is unique after normalisation. A buyer who tries to create a company whose name another company holds gets 409 `NAME_TAKEN` and is told to contact support. There is no way to attach to or take over an existing company from this page. Consequence: two unrelated firms with the same legal name cannot both register; support must resolve it.
- **Updates** need the `version` the form loaded; a stale one is 409 `CONFLICT` and changes nothing. Two simultaneous saves: one wins, the other gets the 409 (tested).
- **Verification.** `verificationStatus` is always `UNVERIFIED`; the buyer cannot send or change it, and editing the legal name does not alter it (there is nothing to re-verify yet). No route lets a buyer set a verification state, and no admin route exists.
- **Documents** belong to the company; only its owner can list, open or remove them; another buyer's document id answers the same 404 as an unknown id.
- **Registration name.** The `companyName` typed at registration stays on the user and is offered as a suggestion; creating the company copies nothing automatically.
- Tested: C-04 to C-14, D-10, D-15, D-17.
