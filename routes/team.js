const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const db = require('../db');
router.use(auth);

const upload = require('../utils/upload');

router.get('/', (req, res) => {
  const members = db.prepare('SELECT * FROM team ORDER BY sort_order, id').all();
  res.render('team/index', { title: 'Team', active: 'team', members });
});

router.get('/create', (req, res) => {
  res.render('team/form', { title: 'New Team Member', active: 'team', member: null });
});

router.post('/', upload.single('photo'), (req, res) => {
  const { name, role, bio, linkedin, twitter, instagram, status, sort_order } = req.body;
  const photo = req.file ? '/uploads/' + req.file.filename : null;
  db.prepare('INSERT INTO team (name, role, bio, photo, linkedin, twitter, instagram, status, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(name, role, bio, photo, linkedin, twitter, instagram, status || 'active', parseInt(sort_order) || 0);
  req.flash('success', 'Team member added!');
  res.redirect('/team');
});

router.get('/:id/edit', (req, res) => {
  const member = db.prepare('SELECT * FROM team WHERE id = ?').get(req.params.id);
  if (!member) { req.flash('error', 'Not found.'); return res.redirect('/team'); }
  res.render('team/form', { title: 'Edit Team Member', active: 'team', member });
});

router.put('/:id', upload.single('photo'), (req, res) => {
  const { name, role, bio, linkedin, twitter, instagram, status, sort_order } = req.body;
  const existing = db.prepare('SELECT * FROM team WHERE id = ?').get(req.params.id);
  const photo = req.file ? '/uploads/' + req.file.filename : existing.photo;
  db.prepare('UPDATE team SET name=?, role=?, bio=?, photo=?, linkedin=?, twitter=?, instagram=?, status=?, sort_order=? WHERE id=?')
    .run(name, role, bio, photo, linkedin, twitter, instagram, status, parseInt(sort_order) || 0, req.params.id);
  req.flash('success', 'Team member updated!');
  res.redirect('/team');
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM team WHERE id = ?').run(req.params.id);
  req.flash('success', 'Deleted.');
  res.redirect('/team');
});

module.exports = router;
