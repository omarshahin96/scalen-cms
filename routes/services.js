const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const db = require('../db');

router.use(auth);

function slugify(str) { return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''); }

router.get('/', (req, res) => {
  const services = db.prepare('SELECT * FROM services ORDER BY sort_order, title').all();
  res.render('services/index', { title: 'Services', active: 'services', services });
});

router.get('/create', (req, res) => {
  res.render('services/form', { title: 'New Service', active: 'services', service: null });
});

router.post('/', (req, res) => {
  const { title, icon, description, features, status, sort_order } = req.body;
  const slug = slugify(title) + '-' + Date.now().toString(36);
  db.prepare('INSERT INTO services (title, slug, icon, description, features, status, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(title, slug, icon || 'fa-star', description, features, status || 'active', parseInt(sort_order) || 0);
  req.flash('success', 'Service created!');
  res.redirect('/services');
});

router.get('/:id/edit', (req, res) => {
  const service = db.prepare('SELECT * FROM services WHERE id = ?').get(req.params.id);
  if (!service) { req.flash('error', 'Not found.'); return res.redirect('/services'); }
  res.render('services/form', { title: 'Edit Service', active: 'services', service });
});

router.put('/:id', (req, res) => {
  const { title, icon, description, features, status, sort_order } = req.body;
  db.prepare('UPDATE services SET title=?, icon=?, description=?, features=?, status=?, sort_order=? WHERE id=?')
    .run(title, icon, description, features, status, parseInt(sort_order) || 0, req.params.id);
  req.flash('success', 'Service updated!');
  res.redirect('/services');
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM services WHERE id = ?').run(req.params.id);
  req.flash('success', 'Service deleted.');
  res.redirect('/services');
});

module.exports = router;
