#!/usr/bin/env bash
# Runs the migration and RLS test suite against a disposable local Postgres.
# Usage: PGHOST=/tmp PGPORT=54329 PGUSER=postgres scripts/test-db.sh
set -euo pipefail
cd "$(dirname "$0")/.."
DB="${TEST_DB:-apprenticeship_test}"
PSQL=(psql -v ON_ERROR_STOP=1 -q -X)

"${PSQL[@]}" -d postgres -c "drop database if exists ${DB}" -c "create database ${DB}"
"${PSQL[@]}" -d "$DB" -f supabase/tests/supabase-stub.sql
for f in supabase/migrations/*.sql; do
  "${PSQL[@]}" -d "$DB" -f "$f"
done
"${PSQL[@]}" -d "$DB" -c "insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-00000000000a', 'reader-a@example.test'),
  ('00000000-0000-4000-8000-00000000000b', 'reader-b@example.test')"

out=$(psql -X -q -d "$DB" -f supabase/tests/rls.test.sql 2>&1 || true)
echo "$out" | grep -E "ALL_TESTS_PASSED|TESTS_FAILED|ERROR" | sed 's/^.*ERROR: *//'
echo "$out" | grep -q "ALL_TESTS_PASSED"
