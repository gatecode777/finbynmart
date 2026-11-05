# Page 23 performance report

2026-11-03, production build, `next start`, Atlas about 30 ms away (i3-1315U, 8 GB), throwaway database. One test buyer with a company and three documents; 30 requests per read (20 for the write), sequential, each from a different client address, from the test client over loopback. Source: `23-buyer-profile-test.mjs` (K group).

| Endpoint | p50 | p95 | p99 | Target (p95) | Met |
|---|---:|---:|---:|---:|---|
| GET /api/buyer/profile | 171 ms | 198 ms | 209 ms | 300 ms | yes |
| GET /api/buyer/company | 81 ms | 96 ms | 98 ms | 350 ms | yes |
| GET /api/buyer/company/documents | 114 ms | 128 ms | 131 ms | 300 ms (list) | yes |
| GET /api/buyer/verification | 177 ms | 225 ms | 230 ms | 400 ms | yes |
| GET /api/buyer/security | 87 ms | 115 ms | 135 ms | 300 ms | yes |
| PATCH /api/buyer/profile | 237 ms | 427 ms | 647 ms | 500 ms | yes (p99 above 500 ms) |

Payloads: each read is under 8 KB and never contains file content (K-02).

Why those times: profile and verification read the user, then the company, then the documents (three small indexed lookups of about 30 ms each, run one after another); the company and security reads are one lookup; the write is one conditional update plus an audit insert plus the rate-limit write. All queries are by `_id`, `ownerUserId` or `companyId` (unique or compound indexes); nothing scans a collection. Not measured separately: serialization time.

**Not measured:** large document histories, many company members (there is no membership), large profile records, and the upload and view routes (file size dominated; only functional behaviour was tested). The three lookups in the overview could be run in parallel to cut about 60 ms; not done.
