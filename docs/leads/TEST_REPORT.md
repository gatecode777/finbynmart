# Lead distribution: test, security and performance report

## Run (this environment: no MongoDB, Docker, WSL or Atlas test database available; the live database was never used)
| Check | Result |
|---|---|
| `npx tsc --noEmit` | 0 errors |
| `npm run lint` | clean |
| all `docs/page-reports/tools/*unit-test.mjs` | 33 scripts, 33 passing (the 32 earlier ones are unchanged and still pass after the supplier-service changes) |
| `62-lead-matching-unit-test.mjs` (new) | 31 checks: exact-equivalence rules, the real 21,392-listing catalogue (4,000 requests: every candidate exact, one per seller, never the direct seller, deterministic; 444 requests have at least one other seller), backoff, states, mandatory notice wording and 14 structural checks (one transaction, unique indexes, atomic lease, recheck per recipient, frozen cutoff, durable notice, worker fails closed, no opt-out in the form, redacted MATCHED view, every supplier read through `findInquiryFor`) |
| `NEXT_DIST_DIR=.next-audit npm run build` | see "Build" below |
| `it-lead-distribution.mjs` (new, 13 scenarios) | **BLOCKED: not run.** It refuses without the isolated-database variables (verified; the guard is unchanged). |

## Prepared integration scenarios (BLOCKED until an isolated transaction-capable database exists)
Direct inquiry + durable job, idempotent retry; one MATCHED recipient per eligible company (not the direct company, not an unrelated one, one for a company with two matching sellers); re-run adds nothing (recipients and notices); three concurrent workers; recovery of an expired lease; restart from cursor 0 after committed recipients; closure before distribution; suspended company skipped and late company not added; legacy inquiry never redistributed; guest gets no job; MATCHED view redaction; no access without a relationship; one recipient's reply leaves other recipients and the shared inquiry untouched. Run: see `docs/testing/TEST_ENVIRONMENT.md` (use `TEST_MONGODB_DB=finbyn_it_leads`).

## Not covered at all (state plainly)
Runtime behaviour against a database; real supplier or buyer accounts end to end (sign-in, send, worker, supplier inbox, quote, buyer comparison); e-mail (none exists); accessibility and responsive runs of the changed screens (inbox kind switch, matching section, form notice: only type-checked and linted); `explain()` of the new queries; any latency or throughput measurement.

## Security review (design and code, not penetration tested)
Recipient lists, company ids, MATCHED eligibility and author identity are never read from a request; the worker needs a bearer secret (constant-time compare, off when unset, rate limited, counts-only responses); every supplier read re-checks the recipient row for the session's company; a MATCHED view is redacted in the service; regexes in the new inbox search are escaped; no new cookie-authenticated write route was added (the inquiry route keeps its own origin/rate-limit pipeline). Abuse bound: the existing 20 inquiries / 10 min per buyer and the 2,000-company cap bound alerts per inquiry; a stronger per-buyer fan-out budget is not built.

## Performance
**No measurement was taken; no number is claimed.** Design intent: submission writes two documents in one transaction and does not wait for fan-out; candidate lookup is one in-memory Map read plus one indexed `$in` query on `company_seller_unique` per 500 sellers; recipients are written per company in bounded batches. To measure: run `docs/performance/tools/bench.mjs` against a production build on a seeded isolated database and record dataset size, concurrency, jobs/min, candidates examined, recipients written and p50/p95/p99.
