const express  = require('express');
const router   = express.Router();
const db       = require('../db');
const bcrypt   = require('bcryptjs');
const crypto   = require('crypto');

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
function getSection(key) {
  const row = db.prepare('SELECT data FROM homepage WHERE section = ?').get(key);
  if (!row) return null;
  try { return JSON.parse(row.data); } catch { return null; }
}
function saveSection(key, data) {
  db.prepare('INSERT OR REPLACE INTO homepage (section, data) VALUES (?, ?)').run(key, JSON.stringify(data));
}
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
  const rows = db.prepare('SELECT section, data FROM homepage').all();
  const result = {};
  rows.forEach(r => { try { result[r.section] = JSON.parse(r.data); } catch { result[r.section] = r.data; } });

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
  const row = db.prepare("SELECT data FROM homepage WHERE section='site'").get();
  res.json(row ? JSON.parse(row.data) : {});
});

// GET /api/settings
router.get('/settings', (req, res) => {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const result = {};
  rows.forEach(r => { result[r.key] = r.value; });
  res.json(result);
});

// GET /api/services
router.get('/services', (req, res) => {
  res.json(db.prepare("SELECT * FROM services WHERE status='active' ORDER BY sort_order ASC").all());
});

// GET /api/portfolio
router.get('/portfolio', (req, res) => {
  res.json(db.prepare("SELECT * FROM portfolio WHERE status='active' ORDER BY sort_order ASC").all());
});

// GET /api/portfolio/:id — single project with parsed detail JSON
router.get('/portfolio/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM portfolio WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  try { row.detail = row.detail ? JSON.parse(row.detail) : {}; } catch { row.detail = {}; }
  res.json(row);
});

// GET /api/case-study/:slug — single case study from portfolio_page JSON
router.get('/case-study/:slug', (req, res) => {
  const pp  = (() => { const r = db.prepare("SELECT data FROM homepage WHERE section='portfolio_page'").get(); return r ? JSON.parse(r.data) : {}; })();
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
  res.json(rows);
});

// GET /api/blog/categories — with published post counts
router.get('/blog/categories', (req, res) => {
  const rows = db.prepare(`
    SELECT bc.id, bc.name, bc.slug,
           COUNT(bp.id) AS post_count
    FROM blog_categories bc
    LEFT JOIN blog_posts bp ON bp.category_id = bc.id AND bp.status = 'published'
    GROUP BY bc.id
    ORDER BY bc.name ASC
  `).all();
  res.json(rows);
});

// GET /api/testimonials
router.get('/testimonials', (req, res) => {
  res.json(db.prepare("SELECT * FROM testimonials WHERE status='active' ORDER BY sort_order ASC").all());
});

// GET /api/team
router.get('/team', (req, res) => {
  res.json(db.prepare("SELECT * FROM team WHERE status='active' ORDER BY sort_order ASC").all());
});

// ─── Inline editing endpoints ────────────────────────────────────────────────

// POST /api/inline-auth — exchange CMS password for a short-lived token
router.post('/inline-auth', (req, res) => {
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
        if (table === 'blog_posts') {
          db.prepare(`UPDATE ${table} SET ${path}=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(value, id);
        } else {
          db.prepare(`UPDATE ${table} SET ${path}=? WHERE id=?`).run(value, id);
        }
      } else {
        // Homepage table section update
        const data = getSection(section);
        if (data === null) continue;
        if (!setByPath(data, path, value)) continue;
        saveSection(section, data);
      }
    }
    res.json({ ok: true, saved: changes.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
