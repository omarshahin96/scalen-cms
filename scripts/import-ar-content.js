/**
 * Loads Arabic content from data/ar-content.json into the CMS as Arabic overrides.
 *
 * File shape (any part optional; values are the Arabic text as it should appear):
 *   {
 *     "sections": { "hero": { "headline": "…", "subtitle": "…" }, "marquee": ["…", "…"] },
 *     "settings": { "tagline": "…" },
 *     "rows":     { "services": { "1": { "title": "…", "description": "…" } },
 *                   "portfolio": { "3": { "title": "…", "detail": { "challenge": "…" } } } }
 *   }
 *
 * - Values are applied on top of the current Arabic content (keys you leave out keep
 *   whatever Arabic they already have, or fall back to English); arrays are replaced.
 * - Only what differs from English is stored (see utils/i18n.js).
 * - Runs once per version of the file: a hash of the file is recorded in the
 *   migrations table, so editing the file applies it again on the next start.
 */
const fs     = require('fs');
const crypto = require('crypto');
const i18n   = require('../utils/i18n');

const JSON_FIELDS = new Set(['detail', 'features']);
const parse = v => { if (typeof v !== 'string') return v; try { return JSON.parse(v); } catch { return v; } };

module.exports = function importArContent(db, file) {
  if (!fs.existsSync(file)) return { skipped: true, reason: 'no ' + file };
  const raw = fs.readFileSync(file);
  const marker = 'ar-content:' + crypto.createHash('sha256').update(raw).digest('hex').slice(0, 16);
  db.exec('CREATE TABLE IF NOT EXISTS migrations (name TEXT PRIMARY KEY, ran_at DATETIME DEFAULT CURRENT_TIMESTAMP)');
  if (db.prepare('SELECT 1 FROM migrations WHERE name = ?').get(marker)) return { skipped: true, reason: 'already applied' };

  const data = JSON.parse(raw.toString('utf8'));
  const counts = { sections: 0, settings: 0, rows: 0, unknown: [] };

  db.transaction(() => {
    for (const [name, value] of Object.entries(data.sections || {})) {
      if (i18n.isTranslationKey(name)) { counts.unknown.push('section ' + name); continue; }
      const current = i18n.getSection(name, 'ar');
      i18n.saveSection(name, i18n.merge(current, value), 'ar');
      counts.sections++;
    }

    if (data.settings && Object.keys(data.settings).length) {
      i18n.saveSettings(data.settings, 'ar');
      counts.settings = Object.keys(data.settings).length;
    }

    for (const [table, items] of Object.entries(data.rows || {})) {
      if (!i18n.ROW_FIELDS[table]) { counts.unknown.push('table ' + table); continue; }
      for (const [id, fields] of Object.entries(items || {})) {
        const row = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id);
        if (!row) { counts.unknown.push(`${table}#${id}`); continue; }
        const current = i18n.localizeRow(table, row, 'ar');
        const values = {};
        for (const [f, v] of Object.entries(fields || {})) {
          if (!i18n.ROW_FIELDS[table].includes(f)) { counts.unknown.push(`${table}.${f}`); continue; }
          values[f] = (JSON_FIELDS.has(f) && v && typeof v === 'object')
            ? JSON.stringify(i18n.merge(parse(current[f]), v))
            : v;
        }
        i18n.saveRowTranslation(table, id, values);
        counts.rows++;
      }
    }

    db.prepare('INSERT OR REPLACE INTO migrations (name) VALUES (?)').run(marker);
  })();

  return counts;
};
