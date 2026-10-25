const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const db = require('../db');
const i18n = require('../utils/i18n');
const upload = require('../utils/upload');

router.use(auth);

function slugify(str) { return String(str || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''); }

// A slug that no other service uses (the service page lives at /services/<slug>)
function uniqueSlug(wanted, id) {
  const base = slugify(wanted) || 'service';
  let slug = base, n = 2;
  while (db.prepare('SELECT 1 FROM services WHERE slug = ? AND id != ?').get(slug, id || 0)) slug = base + '-' + n++;
  return slug;
}

function parseDetail(v) {
  try { const d = JSON.parse(v || '{}'); return d && typeof d === 'object' && !Array.isArray(d) ? d : {}; } catch { return {}; }
}

// The service page fields of the edit form → the `detail` JSON the website reads
function detailFromBody(b, current) {
  const t = v => String(v || '').trim();
  const list = v => [].concat(v === undefined ? [] : v);
  const pairs = (a, c, ka, kc) => {
    const A = list(a), C = list(c), out = [];
    for (let i = 0; i < Math.max(A.length, C.length); i++) {
      const x = t(A[i]), y = t(C[i]);
      if (x || y) out.push({ [ka]: x, [kc]: y });
    }
    return out;
  };
  const d = Object.assign({}, current, {
    hero_subtitle:    t(b.hero_subtitle),
    problem_heading:  t(b.problem_heading),
    problem_body:     t(b.problem_body),
    process:          pairs(b.process_title, b.process_desc, 'title', 'desc'),
    audience_heading: t(b.audience_heading),
    audience_body:    t(b.audience_body),
    industries:       String(b.industries || '').split(/\r?\n/).map(t).filter(Boolean),
    faq:              pairs(b.faq_q, b.faq_a, 'q', 'a'),
    cta_heading:      t(b.cta_heading),
    cta_body:         t(b.cta_body),
    seo_title:        t(b.seo_title),
    seo_description:  t(b.seo_description)
  });
  if ('related_present' in b) d.related = list(b.related).map(Number).filter(Boolean);
  return d;
}

// Hero photo (shared by both languages): a new upload replaces it, "remove" goes back to the default photo
function heroImage(req, current) {
  if (req.file) return '/uploads/' + req.file.filename;
  if (req.body.hero_image_remove) return '';
  return current || '';
}

const projectList = () => db.prepare("SELECT id, title, status FROM portfolio ORDER BY sort_order, id").all();

router.get('/', (req, res) => {
  const services = i18n.localizeRows('services', db.prepare('SELECT * FROM services ORDER BY sort_order, title').all(), i18n.contentLang(req));
  res.render('services/index', { title: 'Services', active: 'services', services });
});

router.get('/create', (req, res) => {
  res.render('services/form', { title: 'New Service', active: 'services', service: null, detail: {}, projects: projectList() });
});

router.post('/', upload.single('hero_image_file'), (req, res) => {
  const { title, icon, description, features, status, sort_order } = req.body;
  const slug = uniqueSlug(req.body.slug || title);
  const detail = detailFromBody(req.body, {});
  detail.hero_image = heroImage(req, '');
  db.prepare('INSERT INTO services (title, slug, icon, description, features, status, sort_order, detail) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(title, slug, icon || 'fa-star', description, features, status || 'active', parseInt(sort_order) || 0, JSON.stringify(detail));
  req.flash('success', 'Service created!');
  res.redirect('/services');
});

router.get('/:id/edit', (req, res) => {
  const service = i18n.localizeRow('services', db.prepare('SELECT * FROM services WHERE id = ?').get(req.params.id), i18n.contentLang(req));
  if (!service) { req.flash('error', 'Not found.'); return res.redirect('/services'); }
  res.render('services/form', { title: 'Edit Service', active: 'services', service, detail: parseDetail(service.detail), projects: projectList() });
});

router.put('/:id', upload.single('hero_image_file'), (req, res) => {
  const { title, icon, description, features, status, sort_order } = req.body;
  const row = db.prepare('SELECT * FROM services WHERE id = ?').get(req.params.id);
  if (!row) { req.flash('error', 'Not found.'); return res.redirect('/services'); }
  if (i18n.contentLang(req) === 'ar') {
    // Arabic: the page text only — the link and the linked projects are shared with English
    const enDetail = parseDetail(row.detail);
    const arDetail = detailFromBody(req.body, enDetail);
    arDetail.related = enDetail.related;
    delete arDetail.hero_image;   // the photo is set in English and shared
    i18n.saveRowTranslation('services', req.params.id, { title, description, features, detail: JSON.stringify(arDetail) });
    req.flash('success', 'Arabic version saved!');
    return res.redirect('/services');
  }
  const slug = req.body.slug ? uniqueSlug(req.body.slug, row.id) : row.slug;
  const current = parseDetail(row.detail);
  const detail = detailFromBody(req.body, current);
  detail.hero_image = heroImage(req, current.hero_image);
  db.prepare('UPDATE services SET title=?, slug=?, icon=?, description=?, features=?, status=?, sort_order=?, detail=? WHERE id=?')
    .run(title, slug, icon, description, features, status, parseInt(sort_order) || 0, JSON.stringify(detail), req.params.id);
  req.flash('success', 'Service updated!');
  res.redirect('/services');
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM services WHERE id = ?').run(req.params.id);
  req.flash('success', 'Service deleted.');
  res.redirect('/services');
});

module.exports = router;
