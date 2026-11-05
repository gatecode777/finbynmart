# Page 30 — Attachment security

Status: **download BLOCKED; listing only.**

- There is no quotation attachment store and no upload path from suppliers, so quotation attachments can only exist if a future module (or a test) writes metadata.
- The detail API returns `{id, name, type, size}` per attachment and nothing else: no storage path, no URL, no uploader information (test D-08).
- No download or preview route exists, so no file can be served, guessed or enumerated. The UI lists names and sizes and states that downloading is not available yet.
- When a store is added it must: serve only through an authenticated route that re-checks buyer → inquiry → quotation ownership, use opaque ids (never paths), set `Content-Disposition: attachment` and `X-Content-Type-Options: nosniff`, allow-list types (PDF and common images/office files), cap the size, and scan or at least validate magic bytes. The existing buyer-document store (`BUYER_DOCS_DIR`) shows the pattern.
