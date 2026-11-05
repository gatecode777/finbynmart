# Page 36 — Attachment security

Code: `checkAttachments`, `createBuyerTicket`, `readBuyerTicketAttachment` in `src/lib/support/ticketService.ts`; route `.../attachments/[attachmentId]/route.ts`.

## Accepted
PDF, JPG, PNG. Defaults: 5 files, 10 MB each. Configurable with `SUPPORT_ATTACH_MAX_FILES` and `SUPPORT_ATTACH_MAX_MB`, never above the ceilings 10 files / 25 MB; a bad value falls back to the default. The limits are published to the form by `/api/buyer/support/categories`, so the browser and server agree.

## Checks (server, before anything is stored)
1. File count and size (oversize request body: 413; too many files: 400). Empty files are ignored by the form parser.
2. The **content** is read (magic bytes): it must really be a PDF, JPEG or PNG; the file name extension must match that content (a text file named `.pdf`, a PNG named `.jpg`, `.exe`, no extension: all 400).
3. One bad file rejects the whole submission; nothing is stored and no ticket is created.

## Storage
Private store (`BUYER_DOCS_DIR`, outside `public/`), random 32-hex file name plus extension; the client's file name is kept only as a display name. If the database insert fails, the files are removed. `ref` (the stored name) is never returned by any API.

## Download
Only the ticket's owner: other buyers, unknown tickets and unknown or path-like attachment ids give 404 (no hint), anonymous 401, supplier 403. The bytes are re-checked by content on every read. Headers: `Content-Disposition: attachment` with the display name, `Content-Type` from the checked content, `Cache-Control: private, no-store`, `X-Content-Type-Options: nosniff`.

## Not done (stated honestly)
- No antivirus or malware scan (none is available). Files are downloaded as attachments, never rendered inline.
- No ImageKit or other external storage (BLOCKED, not configured). On a host without a persistent disk, `storageConfigured()` is false and attachment download is reported as unavailable.
- Attachments cannot be added after creation (no reply flow yet).
