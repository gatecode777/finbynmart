#!/bin/bash
# Restarts the test server on port 3100 WITHOUT rebuilding (so the first request afterwards is a true cold start).
# Same environment as build-and-serve-test.sh: throwaway database, perf lines on, certificate directory.
# Usage (Git Bash, from the repo root):  bash docs/performance/tools/restart-server.sh [extra env as NAME=value ...]
cd "$(dirname "$0")/../../.."
LOG="${TMPDIR:-/tmp}/finbyn-test-server.log"
powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | Where-Object { \$_.CommandLine -match 'start -p 3100' } | ForEach-Object { Stop-Process -Id \$_.ProcessId -Force }"
sleep 2
export NEXT_DIST_DIR=.next-audit
export MONGODB_DB="${TEST_DB:-finbynmart_test}"
export FINBYN_PERF=1
export CERTIFICATE_DOCS_DIR="$(pwd -W 2>/dev/null || pwd)/.next-audit/cert-docs-test"
mkdir -p "$CERTIFICATE_DOCS_DIR"
for kv in "$@"; do export "$kv"; done
: > "$LOG"
(npx next start -p 3100 > "$LOG" 2>&1 &)
for i in $(seq 1 30); do sleep 1; code=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3100/api/auth/me); if [ "$code" != "000" ]; then break; fi; done
echo "server up (first probe $code); log $LOG"
