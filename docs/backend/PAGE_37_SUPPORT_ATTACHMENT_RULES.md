# Page 37 — Attachment rules

Reuses the Page 36 policy (`PAGE_36_SUPPORT_ATTACHMENT_SECURITY.md`) for reply files: PDF, JPG, PNG; at most 5 files and 10 MB each by default (`SUPPORT_ATTACH_MAX_FILES`, `SUPPORT_ATTACH_MAX_MB`, hard ceilings 10 / 25); the **content** is read and must really be that type; the file name's extension must match it; stored in the private store under a random 32-hex name outside `public/`; the client's file name is only a display name; one bad file rejects the whole reply and nothing is stored (no message, no orphan file); an oversize request is 413.

**Where files live**: the original submission's files stay on the ticket (Page 36); reply files are on their message (`attachments[]`, `hasFiles: true`). Only `{id, name, mime, size}` and an owner-checked link ever reach the browser.

**Listing** (`GET .../attachments`): grouped in the page as *Original ticket submission*, *Your replies*, *Support replies* with name, type, size, sender, date. Paged by message that carries files. Internal messages' files are never listed.

**Download** (`GET .../attachments/[id]`): the ticket must be the session buyer's; the id must be 16 hex characters; the file is looked up on the ticket's own attachments or on a buyer-visible message of the same ticket (a file id from another ticket, from an internal message, a path-like or unknown id: 404); the bytes are re-checked by content on every read; response is `attachment`, `private, no-store`, `nosniff`, display name only. There is no public or long-lived URL: access is the session itself, so there is nothing to expire. No preview is offered (a file is never rendered in the page).

**When uploads are unavailable** (`BUYER_DOCS_DIR` not configured): the overview says `limits.canAttach:false`, the Attach button is disabled with a sentence, and the server refuses a file with 503 and a message; a reply without files still works.

Not done: malware scanning, ImageKit or other external storage, signed expiring URLs (not needed with authenticated downloads), attachments added after sending.
