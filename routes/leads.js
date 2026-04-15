const express   = require('express');
const router    = express.Router();
const auth      = require('../middleware/auth');
const db        = require('../db');
const rateLimit = require('express-rate-limit');

const VALID_STATUSES = new Set(['new', 'read', 'replied', 'spam']);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Rate limiter for contact form
const contactLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,  // 10 minutes
  max: 5,
  message: JSON.stringify({ error: 'Too many submissions. Please try again later.' }),
  standardHeaders: true,
  legacyHeaders: false
});

// ── PUBLIC: contact form submit (registered BEFORE auth middleware) ──────────
router.options('/submit', (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');
  res.sendStatus(204);
});

router.post('/submit', contactLimiter, express.json(), express.urlencoded({ extended: false }), (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');

  const name    = (req.body.name    || '').toString().slice(0, 120).trim();
  const email   = (req.body.email   || '').toString().slice(0, 254).trim();
  const phone   = (req.body.phone   || '').toString().slice(0, 30).trim();
  const subject = (req.body.subject || '').toString().slice(0, 200).trim();
  const message = (req.body.message || '').toString().slice(0, 4000).trim();

  if (!name)                 return res.status(400).json({ error: 'Name is required.' });
  if (!email)                return res.status(400).json({ error: 'Email is required.' });
  if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'Invalid email address.' });

  db.prepare('INSERT INTO leads (name, email, phone, subject, message) VALUES (?, ?, ?, ?, ?)')
    .run(name, email, phone || null, subject, message);
  res.json({ success: true, message: 'Message received!' });
});

// ── All routes below require authentication ──────────────────────────────────
router.use(auth);

router.get('/', (req, res) => {
  const { status, search } = req.query;
  let sql = 'SELECT * FROM leads WHERE 1=1';
  const params = [];
  if (status && VALID_STATUSES.has(status)) { sql += ' AND status = ?'; params.push(status); }
  if (search) { sql += ' AND (name LIKE ? OR email LIKE ? OR subject LIKE ?)'; params.push(`%${search}%`, `%${search}%`, `%${search}%`); }
  sql += ' ORDER BY created_at DESC';
  const leads = db.prepare(sql).all(...params);
  const counts = {
    all:     db.prepare('SELECT COUNT(*) as n FROM leads').get().n,
    new:     db.prepare("SELECT COUNT(*) as n FROM leads WHERE status = 'new'").get().n,
    read:    db.prepare("SELECT COUNT(*) as n FROM leads WHERE status = 'read'").get().n,
    replied: db.prepare("SELECT COUNT(*) as n FROM leads WHERE status = 'replied'").get().n,
  };
  res.render('leads/index', { title: 'Leads', active: 'leads', leads, counts, query: req.query });
});

router.get('/export/csv', (req, res) => {
  const leads = db.prepare('SELECT * FROM leads ORDER BY created_at DESC').all();
  const headers = 'Name,Email,Phone,Subject,Message,Status,Date\n';
  const rows = leads.map(l => {
    const esc = v => `"${(v || '').replace(/"/g, '""')}"`;
    return [esc(l.name), esc(l.email), esc(l.phone), esc(l.subject), esc(l.message), esc(l.status), esc(l.created_at)].join(',');
  }).join('\n');
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename=leads.csv');
  res.send(headers + rows);
});

router.get('/:id', (req, res) => {
  const lead = db.prepare('SELECT * FROM leads WHERE id = ?').get(req.params.id);
  if (!lead) { req.flash('error', 'Not found.'); return res.redirect('/leads'); }
  if (lead.status === 'new') {
    db.prepare("UPDATE leads SET status = 'read' WHERE id = ?").run(req.params.id);
    lead.status = 'read';
  }
  res.render('leads/view', { title: 'Lead Details', active: 'leads', lead });
});

router.put('/:id/status', (req, res) => {
  const status = (req.body.status || '').toString();
  if (!VALID_STATUSES.has(status)) {
    req.flash('error', 'Invalid status value.');
    return res.redirect('/leads/' + req.params.id);
  }
  db.prepare('UPDATE leads SET status = ? WHERE id = ?').run(status, req.params.id);
  req.flash('success', 'Status updated.');
  res.redirect('/leads/' + req.params.id);
});

router.put('/:id/notes', (req, res) => {
  const notes = (req.body.notes || '').toString().slice(0, 5000);
  db.prepare('UPDATE leads SET notes = ? WHERE id = ?').run(notes, req.params.id);
  req.flash('success', 'Notes saved.');
  res.redirect('/leads/' + req.params.id);
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM leads WHERE id = ?').run(req.params.id);
  req.flash('success', 'Lead deleted.');
  res.redirect('/leads');
});

module.exports = router;
