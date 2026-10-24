/**
 * Applies data/content-updates.json to the CMS once per version of the file.
 *
 *   {
 *     "services": { "<id>": { "slug": "…", "related": [<portfolio ids>],
 *                             "en": { …service page fields… }, "ar": { …same, Arabic… } } },
 *     "portfolio_status": { "<id>": "active" | "inactive" }
 *   }
 *
 * - services: sets the page link (slug) and the service page content (`detail`) in English,
 *   and the Arabic version as an Arabic override (see utils/i18n.js). Title, description,
 *   icon and the features list are left as they are.
 * - portfolio_status: shows/hides projects (nothing is deleted).
 * A hash of the file is recorded in the migrations table, so the same file never runs twice;
 * editing it applies it again on the next start (and overwrites what it names).
 */
const fs     = require('fs');
const crypto = require('crypto');
const i18n   = require('../utils/i18n');

module.exports = function applyContentUpdates(db, file) {
  if (!fs.existsSync(file)) return { skipped: true, reason: 'no ' + file };
  const raw = fs.readFileSync(file);
  const marker = 'content-updates:' + crypto.createHash('sha256').update(raw).digest('hex').slice(0, 16);
  db.exec('CREATE TABLE IF NOT EXISTS migrations (name TEXT PRIMARY KEY, ran_at DATETIME DEFAULT CURRENT_TIMESTAMP)');
  if (db.prepare('SELECT 1 FROM migrations WHERE name = ?').get(marker)) return { skipped: true, reason: 'already applied' };

  const data = JSON.parse(raw.toString('utf8'));
  const counts = { services: 0, portfolio: 0, unknown: [] };

  db.transaction(() => {
    for (const [id, s] of Object.entries(data.services || {})) {
      const row = db.prepare('SELECT * FROM services WHERE id = ?').get(id);
      if (!row) { counts.unknown.push('services#' + id); continue; }
      let slug = row.slug;
      if (s.slug) {
        const taken = db.prepare('SELECT 1 FROM services WHERE slug = ? AND id != ?').get(s.slug, id);
        if (taken) counts.unknown.push('slug taken: ' + s.slug); else slug = s.slug;
      }
      const related = Array.isArray(s.related) ? s.related.map(Number).filter(Boolean) : [];
      const en = Object.assign({}, s.en || {}, { related });
      db.prepare('UPDATE services SET slug = ?, detail = ? WHERE id = ?').run(slug, JSON.stringify(en), id);
      // Arabic: stored as the difference from the new English page (old Arabic page text is replaced)
      const ar = Object.assign({}, s.ar || {}, { related });
      i18n.saveRowTranslation('services', id, { detail: JSON.stringify(ar) });
      counts.services++;
    }

    for (const [id, status] of Object.entries(data.portfolio_status || {})) {
      if (!['active', 'inactive'].includes(status)) { counts.unknown.push(`portfolio#${id}: ${status}`); continue; }
      const r = db.prepare('UPDATE portfolio SET status = ? WHERE id = ?').run(status, id);
      if (r.changes) counts.portfolio++; else counts.unknown.push('portfolio#' + id);
    }

    db.prepare('INSERT OR REPLACE INTO migrations (name) VALUES (?)').run(marker);
  })();

  return counts;
};
