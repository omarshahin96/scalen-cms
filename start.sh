#!/bin/bash
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Starting Scalen CMS"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
cd "$(dirname "$0")"

if [ -n "$DB_PATH" ]; then
  if [ ! -f "$DB_PATH" ]; then
    echo "No database found at $DB_PATH — copying seed database..."
    cp seed.db "$DB_PATH"
    echo "Seed database copied."
  else
    BLOG_COUNT=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM blog_posts;" 2>/dev/null || echo "0")
    PORTFOLIO_COUNT=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM portfolio;" 2>/dev/null || echo "0")
    SITE_NAME=$(sqlite3 "$DB_PATH" "SELECT value FROM settings WHERE key='site_name';" 2>/dev/null || echo "")
    if [ "$BLOG_COUNT" = "0" ] || [ "$PORTFOLIO_COUNT" = "0" ] || [ "$SITE_NAME" = "Reliable" ]; then
      echo "Database needs re-seed — replacing with seed..."
      cp seed.db "$DB_PATH"
      echo "Seed database replaced."
    else
      echo "Database OK (blog=$BLOG_COUNT posts, portfolio=$PORTFOLIO_COUNT items, site=$SITE_NAME)."
    fi
  fi
  # Always ensure admin password is correct
  sqlite3 "$DB_PATH" "UPDATE users SET password='$2a$10$FAAVr6WqvnbodKZecoDT7uE9QkEUn2YcE6kGSW17lmTf0rVcuyQAS' WHERE email='admin@scalen.com';" 2>/dev/null && echo "Admin password synced."
fi

node server.js
