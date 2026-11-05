# Document upload rules

Code: `src/lib/buyer/documentStorage.ts`, `uploadBuyerDocument` in `src/lib/buyer/profile.ts`, `src/app/api/buyer/company/documents`.

- **Allowed:** PDF, JPG/JPEG, PNG; at most 5 MB (`DOCUMENT_LIMITS`). The size is checked from the declared length before the body is read (413) and again on the file.
- **Content is verified, not just the name:** the first bytes must be a real PDF, JPEG or PNG signature and must agree with the extension. An `.exe` name, executable bytes named `.pdf`, a PNG named `.pdf`, text named `.jpg`, an HTML file named `.png`, an empty file, no extension and a double extension are refused (400, tested D-05).
- **Status** is `PENDING`, chosen by the server. A `status`, `verificationStatus`, `companyId` or `buyerId` in the form is never read (D-01, D-02).
- **Replace:** a second upload of the same type retires the older record and deletes its file; a VERIFIED document cannot be replaced or removed by the buyer (409, D-13). A rejected document can be re-uploaded.
- **Storage:** one private directory (`BUYER_DOCS_DIR`; in development `.data/buyer-docs`, git-ignored), outside `public/`, files named by 32 random hex characters plus the extension; the client's name is display text only. **Production without `BUYER_DOCS_DIR` refuses uploads (503)** and the page says storage is not configured; local disk is not durable on serverless hosting, so a hosted private store is required before deployment (not built).
- **Access:** `GET /api/buyer/company/documents/[id]` streams the file after the ownership check, with `Cache-Control: private, no-store`, `X-Content-Type-Options: nosniff`, `Content-Security-Policy: default-src 'none'; sandbox`, `Referrer-Policy: no-referrer`. There is no permanent or signed URL; nothing to expire or leak. Another buyer's id, an unknown id and traversal strings all answer 404 with no bytes (D-10).
- **Delete:** the owner removes a non-verified document (record retired, file deleted). Audit events carry the document type only.
- Rate limits: 20 uploads and 30 removals per 10 minutes per buyer.
- Not done: virus scanning, image re-encoding, expiry reminders, a retention policy for retired records (they keep metadata, not files).
