# Profile data model

**`users` (existing, extended):** `designation?`, `alternatePhone? { countryCode, number, normalized }`, `alternateEmail?` (lower case, unverified, never a login), `profileVersion?` (absent = 0, +1 on each profile save), `companyId?`, `passwordChangedAt?`. Unchanged and never writable from the profile API: `role`, `accountStatus`, `email`, `phone`, `emailVerified`, `phoneVerified`, `passwordHash`, `sessionVersion`, `consent`, `createdAt`, `lastLoginAt`. Optional fields that are cleared are removed (`$unset`), not stored blank.

**`companies` (new):** `_id, ownerUserId (unique), legalName, legalNameNormalized (unique), displayName?, businessType, industry?, description?, website?, yearEstablished?, companyEmail?, country, state?, city?, postalCode?, registeredAddress?, operatingAddress?, verificationStatus ("UNVERIFIED" only), version, createdAt, updatedAt`. The normalised name lower-cases, folds Unicode and replaces punctuation and runs of spaces with one space, so "ALPHA  fabrics PVT. ltd." equals "Alpha Fabrics Pvt Ltd".

**`company_documents` (new):** `_id, companyId, uploadedBy, documentType, fileReference (random name, never the client's), originalFilename (display only), mimeType, fileSize, verificationStatus (PENDING on upload; VERIFIED, REJECTED, RESUBMISSION_REQUIRED only by a future reviewer), submittedAt, reviewedAt, reviewedBy, expiryDate?, rejectionReason?, active, deletedAt, createdAt, updatedAt`. EXPIRED is computed (a verified document past its date), not stored. Indexes: unique `{companyId, documentType}` where `active` is true; `{companyId, createdAt}`.

**`security_events` (existing):** PROFILE_UPDATED, COMPANY_CREATED, COMPANY_UPDATED, DOCUMENT_UPLOADED, DOCUMENT_REPLACED, DOCUMENT_DELETED, PASSWORD_CHANGED, each with `userId`, `at` and the **names** of the fields or the document type, never values, file names or contents.

The browser receives DTOs only (no ids of accounts, no hash, no `fileReference`, no `_id` of the user). Document ids are given to the owner to open or remove their own file.
