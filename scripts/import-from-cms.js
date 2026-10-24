/**
 * One-time content import from another Scalen CMS instance.
 *
 * Copies everything the source exposes on its public API — homepage/page
 * sections, settings, services, portfolio (case studies), blog posts and
 * categories, testimonials, team — plus every /uploads/* image those records
 * reference, into this instance's database and uploads folder.
 *
 * Runs only when the IMPORT_FROM env var is set, and only once per source:
 * a row in the `migrations` table records the run, so later restarts never
 * overwrite edits made here. To re-run on purpose, set IMPORT_FORCE=1.
 *
 * Not copied (not exposed publicly): admin users, leads, draft/inactive rows.
 */
const fs    = require('fs');
const path  = require('path');
const https = require('https');
const http  = require('http');

function fetchBuffer(url, redirects = 3) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https:') ? https : http;
    lib.get(url, { headers: { 'User-Agent': 'scalen-cms-import' } }, res => {
      if ([301, 302, 307, 308].includes(res.statusCode) && res.headers.location && redirects > 0) {
        res.resume();
        return resolve(fetchBuffer(new URL(res.headers.location, url).toString(), redirects - 1));
      }
      if (res.statusCode !== 200) { res.resume(); return reject(new Error(`${url} → HTTP ${res.statusCode}`)); }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    }).on('error', reject);
  });
}
async function getJSON(url) { return JSON.parse((await fetchBuffer(url)).toString('utf8')); }

function columnsOf(db, table) {
  return db.prepare(`PRAGMA table_info(${table})`).all().map(c => c.name);
}
function insertRows(db, table, rows) {
  const cols = columnsOf(db, table);
  let n = 0;
  for (const row of rows) {
    const keys = Object.keys(row).filter(k => cols.includes(k));
    if (!keys.length) continue;
    const vals = keys.map(k => (row[k] !== null && typeof row[k] === 'object') ? JSON.stringify(row[k]) : row[k]);
    db.prepare(`INSERT INTO ${table} (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`).run(...vals);
    n++;
  }
  return n;
}

module.exports = async function importFromCms(source, db) {
  source = source.replace(/\/+$/, '');
  db.exec(`CREATE TABLE IF NOT EXISTS migrations (name TEXT PRIMARY KEY, ran_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);
  const marker = `import:${source}`;
  if (db.prepare('SELECT 1 FROM migrations WHERE name = ?').get(marker) && process.env.IMPORT_FORCE !== '1') {
    return { skipped: true, reason: `already imported from ${source}` };
  }

  // 1) Fetch everything first — if the source is unreachable, nothing changes here.
  const [homepage, settings, services, portfolio, blog, categories, testimonials, team] = await Promise.all([
    getJSON(`${source}/api/homepage`),
    getJSON(`${source}/api/settings`),
    getJSON(`${source}/api/services`),
    getJSON(`${source}/api/portfolio`),
    getJSON(`${source}/api/blog?limit=1000`),
    getJSON(`${source}/api/blog/categories`),
    getJSON(`${source}/api/testimonials`),
    getJSON(`${source}/api/team`),
  ]);

  // 2) Copy referenced uploads (images) into public/uploads.
  const uploadsDir = path.join(__dirname, '..', 'public', 'uploads');
  fs.mkdirSync(uploadsDir, { recursive: true });
  const blob = JSON.stringify([homepage, settings, services, portfolio, blog, testimonials, team]);
  const files = [...new Set(blob.match(/\/uploads\/[A-Za-z0-9._-]+/g) || [])];
  const copied = [], failed = [];
  for (const rel of files) {
    const name = path.basename(rel);
    const dest = path.join(uploadsDir, name);
    if (fs.existsSync(dest)) { copied.push(name); continue; }
    try { fs.writeFileSync(dest, await fetchBuffer(`${source}/uploads/${encodeURIComponent(name)}`)); copied.push(name); }
    catch (e) { failed.push(`${name}: ${e.message}`); }
  }

  // 3) Write the database in one transaction.
  const counts = {};
  db.transaction(() => {
    const upsertSection = db.prepare('INSERT OR REPLACE INTO homepage (section, data) VALUES (?, ?)');
    counts.sections = 0;
    for (const [section, data] of Object.entries(homepage)) {
      if (section === 'tracking') continue;                 // synthesized from settings by the API
      upsertSection.run(section, typeof data === 'string' ? data : JSON.stringify(data));
      counts.sections++;
    }

    const updSetting = db.prepare('UPDATE settings SET value = ? WHERE key = ?');
    const insSetting = db.prepare('INSERT INTO settings (key, value, label, type, group_name) VALUES (?, ?, ?, ?, ?)');
    counts.settings = 0;
    for (const [key, value] of Object.entries(settings)) {
      if (updSetting.run(value, key).changes === 0) insSetting.run(key, value, key, 'text', 'general');
      counts.settings++;
    }

    db.prepare('DELETE FROM blog_posts').run();
    db.prepare('DELETE FROM blog_categories').run();
    counts.categories   = insertRows(db, 'blog_categories', categories);
    counts.blog_posts   = insertRows(db, 'blog_posts', blog);

    for (const [table, rows] of [['services', services], ['portfolio', portfolio], ['testimonials', testimonials], ['team', team]]) {
      db.prepare(`DELETE FROM ${table}`).run();
      counts[table] = insertRows(db, table, rows);
    }

    db.prepare('INSERT OR REPLACE INTO migrations (name) VALUES (?)').run(marker);
  })();

  return { source, counts, uploads: { copied: copied.length, failed } };
};
