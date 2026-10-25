const express  = require('express');
const router   = express.Router();
const db       = require('../db');
const bcrypt   = require('bcryptjs');
const crypto   = require('crypto');
const rateLimit = require('express-rate-limit');
const i18n = require('../utils/i18n');

// In-memory edit tokens (cleared on server restart)
const editTokens = new Map(); // token -> expiry ms

// CORS — open for public read; inline-edit uses token auth (no cookies needed)
router.use((req, res, next) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');
  // Do NOT set Access-Control-Allow-Credentials — inline editor uses bearer tokens, not cookies
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// ─── helpers ────────────────────────────────────────────────────────────────
// Every public GET accepts ?lang=ar → Arabic overrides merged over English (fallback per field)
const getSection  = (key, lang) => i18n.getSection(key, lang);
const saveSection = (key, data, lang) => i18n.saveSection(key, data, lang);
// Traverse a dot-notation path (e.g. "case_studies.0.title") and set value
function setByPath(obj, path, value) {
  const parts = path.split('.');
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const k = isNaN(parts[i]) ? parts[i] : parseInt(parts[i], 10);
    if (cur[k] === undefined || cur[k] === null) return false;
    cur = cur[k];
  }
  const last = parts[parts.length - 1];
  cur[isNaN(last) ? last : parseInt(last, 10)] = value;
  return true;
}
function verifyToken(token) {
  if (!token || !editTokens.has(token)) return false;
  if (editTokens.get(token) < Date.now()) { editTokens.delete(token); return false; }
  return true;
}

// ─── Public read endpoints ───────────────────────────────────────────────────

// GET /api/homepage — all homepage sections
router.get('/homepage', (req, res) => {
  const lang = i18n.apiLang(req);
  const rows = db.prepare('SELECT section, data FROM homepage').all();
  const result = {};
  rows.forEach(r => {
    if (i18n.isTranslationKey(r.section)) return;            // "<section>@ar" rows are internal
    if (lang === 'ar') { result[r.section] = getSection(r.section, 'ar'); return; }
    try { result[r.section] = JSON.parse(r.data); } catch { result[r.section] = r.data; }
  });

  // Merge tracking settings (gtm_head, gtm_body, meta_pixel, custom_head) into result.tracking
  const trackingRows = db.prepare("SELECT key, value FROM settings WHERE group_name = 'tracking'").all();
  if (trackingRows.length) {
    const tracking = {};
    trackingRows.forEach(r => { tracking[r.key] = r.value; });
    result.tracking = tracking;
  }

  res.json(result);
});

// GET /api/theme — fonts + colors
router.get('/theme', (req, res) => {
  const row = db.prepare("SELECT data FROM homepage WHERE section='theme'").get();
  res.json(row ? JSON.parse(row.data) : {});
});

// GET /api/site — logo, site name, nav CTA
router.get('/site', (req, res) => {
  res.json(getSection('site', i18n.apiLang(req)) || {});
});

// GET /api/settings
router.get('/settings', (req, res) => {
  res.json(i18n.getSettings(i18n.apiLang(req)));
});

// GET /api/services
router.get('/services', (req, res) => {
  res.json(i18n.localizeRows('services', db.prepare("SELECT * FROM services WHERE status='active' ORDER BY sort_order ASC").all(), i18n.apiLang(req)));
});

// GET /api/services/:slug — one service page: detail parsed, plus the projects it links to
router.get('/services/:slug', (req, res) => {
  const lang = i18n.apiLang(req);
  const base = db.prepare("SELECT * FROM services WHERE slug = ? AND status='active'").get(req.params.slug);
  const row = i18n.localizeRow('services', base, lang);
  if (!row) return res.status(404).json({ error: 'Not found' });
  try { row.detail = row.detail ? JSON.parse(row.detail) : {}; } catch { row.detail = {}; }
  // The hero photo is set once (in English) and shared by both languages
  try { row.detail.hero_image = (JSON.parse(base.detail || '{}') || {}).hero_image || ''; } catch { row.detail.hero_image = ''; }
  const ids = (Array.isArray(row.detail.related) ? row.detail.related : []).map(Number).filter(Boolean);
  row.projects = ids.map(id => i18n.localizeRow('portfolio', db.prepare("SELECT * FROM portfolio WHERE id = ? AND status='active'").get(id), lang))
    .filter(Boolean)
    .map(p => ({ id: p.id, title: p.title, category: p.category, client: p.client, image: p.image, description: p.description }));
  row.others = i18n.localizeRows('services', db.prepare("SELECT id, title, slug, icon, description, translations FROM services WHERE status='active' AND id != ? ORDER BY sort_order ASC").all(row.id), lang)
    .map(o => ({ title: o.title, slug: o.slug, icon: o.icon, description: o.description }));
  res.json(row);
});

// GET /api/portfolio
router.get('/portfolio', (req, res) => {
  res.json(i18n.localizeRows('portfolio', db.prepare("SELECT * FROM portfolio WHERE status='active' ORDER BY sort_order ASC").all(), i18n.apiLang(req)));
});

// GET /api/portfolio/:id — single project with parsed detail JSON
router.get('/portfolio/:id', (req, res) => {
  const row = i18n.localizeRow('portfolio', db.prepare("SELECT * FROM portfolio WHERE id = ? AND status='active'").get(req.params.id), i18n.apiLang(req));
  if (!row) return res.status(404).json({ error: 'Not found' });
  try { row.detail = row.detail ? JSON.parse(row.detail) : {}; } catch { row.detail = {}; }
  res.json(row);
});

// GET /api/case-study/:slug — single case study from portfolio_page JSON
router.get('/case-study/:slug', (req, res) => {
  const pp  = getSection('portfolio_page', i18n.apiLang(req)) || {};
  const cs  = (pp.case_studies || []).find(c => c.slug === req.params.slug);
  if (!cs) return res.status(404).json({ error: 'Not found' });
  res.json(cs);
});

// GET /api/blog?limit=N  — includes category_name via LEFT JOIN
router.get('/blog', (req, res) => {
  const limit = req.query.limit ? parseInt(req.query.limit, 10) : 200;
  const rows = db.prepare(`
    SELECT bp.*, bc.name AS category_name
    FROM blog_posts bp
    LEFT JOIN blog_categories bc ON bp.category_id = bc.id
    WHERE bp.status = 'published'
    ORDER BY bp.published_at DESC
    LIMIT ?
  `).all(limit);
  const lang = i18n.apiLang(req);
  if (lang !== 'ar') return res.json(rows.map(r => i18n.localizeRow('blog_posts', r, 'en')));
  const catName = {};
  i18n.localizeRows('blog_categories', db.prepare('SELECT * FROM blog_categories').all(), 'ar').forEach(c => { catName[c.id] = c.name; });
  res.json(rows.map(r => {
    const out = i18n.localizeRow('blog_posts', r, 'ar');
    if (r.category_id && catName[r.category_id] !== undefined) out.category_name = catName[r.category_id];
    return out;
  }));
});

// GET /api/blog/categories — with published post counts
router.get('/blog/categories', (req, res) => {
  const rows = db.prepare(`
    SELECT bc.id, bc.name, bc.slug, bc.translations,
           COUNT(bp.id) AS post_count
    FROM blog_categories bc
    LEFT JOIN blog_posts bp ON bp.category_id = bc.id AND bp.status = 'published'
    GROUP BY bc.id
    ORDER BY bc.name ASC
  `).all();
  res.json(i18n.localizeRows('blog_categories', rows, i18n.apiLang(req)));
});

// GET /api/testimonials
router.get('/testimonials', (req, res) => {
  res.json(i18n.localizeRows('testimonials', db.prepare("SELECT * FROM testimonials WHERE status='active' ORDER BY sort_order ASC").all(), i18n.apiLang(req)));
});

// GET /api/team
router.get('/team', (req, res) => {
  res.json(i18n.localizeRows('team', db.prepare("SELECT * FROM team WHERE status='active' ORDER BY sort_order ASC").all(), i18n.apiLang(req)));
});

// ─── Inline editing endpoints ────────────────────────────────────────────────

// POST /api/inline-auth — exchange CMS password for a short-lived token
// This endpoint checks the admin password and is public — cap guesses per IP.
const inlineAuthLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => res.status(429).json({ error: 'Too many attempts. Try again in 15 minutes.' })
});

router.post('/inline-auth', inlineAuthLimiter, (req, res) => {
  const { password } = req.body || {};
  if (!password) return res.status(400).json({ error: 'Password required' });
  const admin = db.prepare("SELECT password FROM users WHERE role='admin' LIMIT 1").get();
  if (!admin || !bcrypt.compareSync(password, admin.password)) {
    return res.status(401).json({ error: 'Invalid password' });
  }
  const token = crypto.randomBytes(24).toString('hex');
  editTokens.set(token, Date.now() + 4 * 60 * 60 * 1000); // 4 hours
  res.json({ token });
});

// POST /api/inline-save — save one or more field changes
// Allowed DB tables and their editable fields (whitelist for safety)
const DB_ALLOWED = {
  services:     ['title', 'description', 'icon'],
  portfolio:    ['title', 'category', 'description', 'client', 'year'],
  blog_posts:   ['title', 'excerpt'],
  team:         ['name', 'role'],
  testimonials: ['name', 'role', 'company', 'quote']
};

router.post('/inline-save', (req, res) => {
  const { token, changes } = req.body || {};
  const lang = (req.body && req.body.lang === 'ar') ? 'ar' : 'en';   // Arabic page → Arabic overrides
  if (!verifyToken(token)) return res.status(401).json({ error: 'Invalid or expired token. Re-enter edit mode.' });
  if (!Array.isArray(changes) || !changes.length) return res.status(400).json({ error: 'changes must be a non-empty array' });

  try {
    for (const ch of changes) {
      const { section, path, value, id } = ch;
      if (!section || path === undefined) continue;

      if (section.startsWith('db:')) {
        // DB table row update
        const table = section.slice(3);
        const allowed = DB_ALLOWED[table];
        if (!allowed || !id || !allowed.includes(path)) continue;
        if (lang === 'ar') {
          if ((i18n.ROW_FIELDS[table] || []).includes(path)) i18n.saveRowTranslation(table, id, { [path]: value });
          continue;
        }
        if (table === 'blog_posts') {
          db.prepare(`UPDATE ${table} SET ${path}=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(value, id);
        } else {
          db.prepare(`UPDATE ${table} SET ${path}=? WHERE id=?`).run(value, id);
        }
      } else {
        // Homepage table section update
        if (i18n.isTranslationKey(section)) continue;
        const data = getSection(section, lang);
        if (data === null) continue;
        if (!setByPath(data, path, value)) continue;
        saveSection(section, data, lang);
      }
    }
    res.json({ ok: true, saved: changes.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
