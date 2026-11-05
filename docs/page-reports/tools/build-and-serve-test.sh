#!/bin/bash
# Rebuild into .next-audit and restart a test server on port 3100.
# Never touches .next, so a running `next dev` is left alone.
# Usage (Git Bash, from the repo root):  TEST_DB=finbynmart_test bash docs/page-reports/tools/build-and-serve-test.sh
# Next edits tsconfig.json when NEXT_DIST_DIR changes: revert it afterwards (git checkout tsconfig.json if it was clean).
cd "$(dirname "$0")/../../.."
LOG="${TMPDIR:-/tmp}/finbyn-test-server.log"
powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | Where-Object { \$_.CommandLine -match 'start -p 3100' } | ForEach-Object { Stop-Process -Id \$_.ProcessId -Force }"
sleep 2
export NEXT_DIST_DIR=.next-audit
npx tsc --noEmit 2>&1 | tail -5
npm run build 2>&1 | grep -E "Error|error TS|Failed|✓ Generating"
# Tests must run against a throwaway database, never the live collections.
if [ -n "$TEST_DB" ]; then export MONGODB_DB="$TEST_DB"; fi
# Certificate files for the Page 11 tests live in a private throwaway directory (never under public/).
export FINBYN_PERF=1
# The functional suites edit the database directly (moderation, fixtures) and expect to see it at once: public-data caches off.
export FINBYN_PUBLIC_CACHE_MS="${FINBYN_PUBLIC_CACHE_MS:-0}"
export CERTIFICATE_DOCS_DIR="$(pwd -W 2>/dev/null || pwd)/.next-audit/cert-docs-test"
mkdir -p "$CERTIFICATE_DOCS_DIR"
(npx next start -p 3100 > "$LOG" 2>&1 &)
sleep 8
curl -s -o /dev/null -w "server %{http_code}\n" http://localhost:3100/
