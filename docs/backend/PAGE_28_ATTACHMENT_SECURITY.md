# Page 28 — Attachment security

**BLOCKED: inquiries have no attachments.** The inquiry form has no upload and the record has no file field; there is no ImageKit. The page shows "No attachments. Files cannot be added to an inquiry yet." and renders no file name, preview or download control.

## What must not happen
Private storage exists today only for a buyer's **company documents** (Page 23: GST, PAN and similar, streamed to their owner through `/api/buyer/company/documents/[id]`). Those are KYC files, unrelated to any inquiry: the details page never lists, links or previews them.

## Contract for when inquiry attachments are added
1. Store files privately (never a public URL); the record keeps a file reference, display name, type, size, `uploadedAt`, owner.
2. Every file request resolves the inquiry by `{ reference, buyerId }` first, then checks the attachment belongs to that inquiry, then streams it through an authenticated route or issues a short-lived signed URL (minutes) after re-checking ownership; the client never supplies a URL or path.
3. Type allow-list (PDF, JPG, PNG) checked by content, size limit, download as attachment with `nosniff`; previews only for images and PDF.
4. Responses carry no storage credentials; an expired or foreign link is 404, not 403, so files cannot be probed.
5. Add `capabilities.attachments`, the list in the detail DTO and tests for: wrong buyer, wrong inquiry, expired link, invalid reference, unsupported preview, and that company documents stay unreachable from here.
