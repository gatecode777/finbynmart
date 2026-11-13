# Supplier portal configuration

| Variable | Required for | Notes |
|---|---|---|
| `MONGODB_URI`, `MONGODB_DB`, `AUTH_SECRET` | everything | git-ignored `.env.local`; never commit |
| `IMAGEKIT_PUBLIC_KEY`, `IMAGEKIT_PRIVATE_KEY`, `IMAGEKIT_URL_ENDPOINT` | product image upload | private key is server-only |
| `QUOTATION_TAX_RULES` | **quotation submission** | JSON array of approved treatments (see `src/lib/supplier/taxConfig.ts`). Empty or invalid = submission blocked with a clear message; drafts still work. The business must approve the treatments: no rate, exemption, place-of-supply or freight-tax logic is built in. |

Isolated test configuration (TEST ONLY, never production): the Page 43/44 suites use their own fixture (two servers from one build, one with and one without the variable). Do not copy a test rate into production.
