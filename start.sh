#!/bin/bash
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Starting Scalen CMS"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
cd "$(dirname "$0")"

# If a persistent DB_PATH is set and no database exists there yet, copy the seed
if [ -n "$DB_PATH" ] && [ ! -f "$DB_PATH" ]; then
  echo "No database found at $DB_PATH — copying seed database..."
  cp seed.db "$DB_PATH"
  echo "Seed database copied."
fi

node server.js
