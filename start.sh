#!/bin/bash
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Starting Scalen CMS"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
cd "$(dirname "$0")"

# If a persistent DB_PATH is set, check if DB exists and has blog posts
if [ -n "$DB_PATH" ]; then
  if [ ! -f "$DB_PATH" ]; then
    echo "No database found at $DB_PATH — copying seed database..."
    cp seed.db "$DB_PATH"
    echo "Seed database copied."
  else
    # Check if blog_posts table is empty (means DB was created without seed data)
    BLOG_COUNT=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM blog_posts;" 2>/dev/null || echo "0")
    PORTFOLIO_COUNT=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM portfolio;" 2>/dev/null || echo "0")
    if [ "$BLOG_COUNT" = "0" ] || [ "$PORTFOLIO_COUNT" = "0" ]; then
      echo "Database exists but is missing data (blog=$BLOG_COUNT, portfolio=$PORTFOLIO_COUNT) — replacing with seed..."
      cp seed.db "$DB_PATH"
      echo "Seed database replaced."
    else
      echo "Database OK (blog=$BLOG_COUNT posts, portfolio=$PORTFOLIO_COUNT items)."
    fi
  fi
fi

node server.js
