const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const db = require('../db');
router.use(auth);

const upload = require('../utils/upload');

function slugify(str) { return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''); }

router.get('/', (req, res) => {
  const { search, category } = req.query;
  let sql = 'SELECT * FROM portfolio WHERE 1=1';
  const params = [];
  if (search) { sql += ` AND (title LIKE ? OR client LIKE ?)`; params.push(`%${search}%`, `%${search}%`); }
  if (category) { sql += ` AND category = ?`; params.push(category); }
  sql += ' ORDER BY sort_order, title';
  const projects = db.prepare(sql).all(...params);
  const categories = db.prepare('SELECT DISTINCT category FROM portfolio WHERE category IS NOT NULL ORDER BY category').all().map(r => r.category);
  res.render('portfolio/index', { title: 'Portfolio', active: 'portfolio', projects, categories, query: req.query });
});

router.get('/create', (req, res) => {
  res.render('portfolio/form', { title: 'New Project', active: 'portfolio', project: null });
});

router.post('/', upload.single('image'), (req, res) => {
  const { title, category, client, year, description, results, status, sort_order } = req.body;
  const slug = slugify(title) + '-' + Date.now().toString(36);
  const image = req.file ? '/uploads/' + req.file.filename : null;
  db.prepare('INSERT INTO portfolio (title, slug, category, client, year, description, results, image, status, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(title, slug, category, client, year, description, results, image, status || 'active', parseInt(sort_order) || 0);
  req.flash('success', 'Project created!');
  res.redirect('/portfolio');
});

router.get('/:id/edit', (req, res) => {
  const project = db.prepare('SELECT * FROM portfolio WHERE id = ?').get(req.params.id);
  if (!project) { req.flash('error', 'Not found.'); return res.redirect('/portfolio'); }
  try { project.detail = project.detail ? JSON.parse(project.detail) : {}; } catch { project.detail = {}; }
  res.render('portfolio/form', { title: 'Edit Project', active: 'portfolio', project });
});

router.put('/:id', upload.any(), (req, res) => {
  const { title, category, client, year, description, results, status, sort_order } = req.body;
  const project = db.prepare('SELECT * FROM portfolio WHERE id = ?').get(req.params.id);
  if (!project) { req.flash('error', 'Not found.'); return res.redirect('/portfolio'); }

  // Main image
  const mainFile = (req.files || []).find(f => f.fieldname === 'image');
  const image    = mainFile ? '/uploads/' + mainFile.filename : project.image;

  // Detail page fields
  const heroSubtitle = req.body.hero_subtitle || '';
  const challenge    = req.body.challenge || '';
  const solution     = req.body.solution || '';
  const testimonialQuote = req.body.tst_quote || '';
  const testimonialName  = req.body.tst_name  || '';
  const testimonialRole  = req.body.tst_role  || '';
  const testimonialCo    = req.body.tst_company || '';

  // Gallery images (up to 3)
  const galleryUrls = [0,1,2].map(i => {
    const f = (req.files || []).find(f => f.fieldname === 'gallery_file_' + i);
    return f ? '/uploads/' + f.filename : (req.body['gallery_' + i] || '');
  });

  // Stats (up to 4)
  const stats = [0,1,2,3].map(i => ({
    num:   (req.body['stat_num_'   + i] || '').trim(),
    label: (req.body['stat_label_' + i] || '').trim()
  })).filter(s => s.num || s.label);

  // Process steps (up to 4)
  const process = [0,1,2,3].map(i => ({
    step:  req.body['proc_step_'  + i] || String(i + 1).padStart(2, '0'),
    title: req.body['proc_title_' + i] || '',
    desc:  req.body['proc_desc_'  + i] || ''
  })).filter(p => p.title || p.desc);

  // Avatar upload
  const avatarFile  = (req.files || []).find(f => f.fieldname === 'tst_avatar_file');
  const tstAvatar   = avatarFile ? '/uploads/' + avatarFile.filename : (req.body.tst_avatar || '');

  const detail = {
    hero_subtitle: heroSubtitle,
    challenge,
    solution,
    gallery: galleryUrls,
    stats,
    process,
    testimonial: { quote: testimonialQuote, name: testimonialName, role: testimonialRole, company: testimonialCo, avatar: tstAvatar }
  };

  db.prepare('UPDATE portfolio SET title=?, category=?, client=?, year=?, description=?, results=?, image=?, status=?, sort_order=?, detail=? WHERE id=?')
    .run(title, category, client, year, description, results, image, status, parseInt(sort_order) || 0, JSON.stringify(detail), req.params.id);
  req.flash('success', 'Project updated!');
  res.redirect('/portfolio/' + req.params.id + '/edit');
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM portfolio WHERE id = ?').run(req.params.id);
  req.flash('success', 'Project deleted.');
  res.redirect('/portfolio');
});

module.exports = router;
