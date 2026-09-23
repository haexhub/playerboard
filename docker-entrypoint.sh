#!/bin/sh
set -eu

echo "Applying pending Supabase migrations..."
./node_modules/.bin/supabase db push --db-url "$SUPABASE_DB_URL" --yes --include-all

exec node .output/server/index.mjs
