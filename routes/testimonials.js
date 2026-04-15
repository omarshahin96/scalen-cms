const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const db = require('../db');

router.use(auth);

router.get('/', (req, res) => {
  const testimonials = db.prepare('SELECT * FROM testimonials ORDER BY sort_order, id').all();
  res.render('testimonials/index', { title: 'Testimonials', active: 'testimonials', testimonials });
});

router.get('/create', (req, res) => {
  res.render('testimonials/form', { title: 'New Testimonial', active: 'testimonials', item: null });
});

router.post('/', (req, res) => {
  const { name, role, company, quote, rating, status, sort_order } = req.body;
  db.prepare('INSERT INTO testimonials (name, role, company, quote, rating, status, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(name, role, company, quote, parseInt(rating) || 5, status || 'active', parseInt(sort_order) || 0);
  req.flash('success', 'Testimonial added!');
  res.redirect('/testimonials');
});

router.get('/:id/edit', (req, res) => {
  const item = db.prepare('SELECT * FROM testimonials WHERE id = ?').get(req.params.id);
  if (!item) { req.flash('error', 'Not found.'); return res.redirect('/testimonials'); }
  res.render('testimonials/form', { title: 'Edit Testimonial', active: 'testimonials', item });
});

router.put('/:id', (req, res) => {
  const { name, role, company, quote, rating, status, sort_order } = req.body;
  db.prepare('UPDATE testimonials SET name=?, role=?, company=?, quote=?, rating=?, status=?, sort_order=? WHERE id=?')
    .run(name, role, company, quote, parseInt(rating) || 5, status, parseInt(sort_order) || 0, req.params.id);
  req.flash('success', 'Testimonial updated!');
  res.redirect('/testimonials');
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM testimonials WHERE id = ?').run(req.params.id);
  req.flash('success', 'Deleted.');
  res.redirect('/testimonials');
});

module.exports = router;
