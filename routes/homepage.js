const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const db = require('../db');
router.use(auth);

const upload = require('../utils/upload');

function getSection(section) {
  const row = db.prepare('SELECT data FROM homepage WHERE section = ?').get(section);
  if (!row) return null;
  try { return JSON.parse(row.data); } catch { return null; }
}

function uploadUrl(req, fieldname) {
  if (!req.files || !req.files.length) return null;
  const f = req.files.find(f => f.fieldname === fieldname);
  return f ? `http://localhost:3000/uploads/${f.filename}` : null;
}

router.get('/', (req, res) => {
  const sections = {};
  ['hero', 'stats', 'about', 'skills', 'marquee', 'contact', 'footer'].forEach(s => {
    sections[s] = getSection(s);
  });
  res.render('homepage/index', { title: 'Homepage Editor', active: 'homepage', sections });
});

const ALLOWED = ['hero', 'stats', 'about', 'skills', 'marquee', 'contact', 'footer'];

router.post('/:section', upload.any(), (req, res) => {
  const { section } = req.params;
  if (!ALLOWED.includes(section)) return res.redirect('/homepage');

  let data;
  try {
    if (section === 'stats') {
      const numbers = [].concat(req.body.number || []);
      const suffixes = [].concat(req.body.suffix || []);
      const labels = [].concat(req.body.label || []);
      data = numbers.map((n, i) => ({ number: n, suffix: suffixes[i] || '', label: labels[i] || '' }));

    } else if (section === 'skills') {
      const names = [].concat(req.body.skill_name || []);
      const percents = [].concat(req.body.skill_percent || []);
      data = names.map((n, i) => ({ name: n, percent: parseInt(percents[i]) || 0 }));

    } else if (section === 'marquee') {
      data = [].concat(req.body.item || []).filter(i => i.trim());

    } else if (section === 'hero') {
      data = {
        badge: req.body.badge || '',
        headline: req.body.headline || '',
        subtitle: req.body.subtitle || '',
        btn1_text: req.body.btn1_text || '', btn1_url: req.body.btn1_url || '',
        btn2_text: req.body.btn2_text || '', btn2_url: req.body.btn2_url || '',
        clients_text: req.body.clients_text || '',
        image: uploadUrl(req, 'image_file') || req.body.image || '',
        card1: {
          label:     req.body.card1_label     || '',
          title:     req.body.card1_title     || '',
          score:     req.body.card1_score     || '',
          score_sub: req.body.card1_score_sub || ''
        },
        card2: {
          icon:  req.body.card2_icon  || '',
          title: req.body.card2_title || ''
        }
      };

    } else if (section === 'about') {
      data = {
        headline: req.body.headline || '',
        body: req.body.body || '',
        years_badge: req.body.years_badge || '',
        btn_text: req.body.btn_text || '',
        btn_url: req.body.btn_url || '',
        image1: uploadUrl(req, 'image1_file') || req.body.image1 || '',
        image2: uploadUrl(req, 'image2_file') || req.body.image2 || ''
      };

    } else {
      data = req.body;
      delete data._method;
    }

    db.prepare('INSERT OR REPLACE INTO homepage (section, data) VALUES (?, ?)').run(section, JSON.stringify(data));
    req.flash('success', `${section.charAt(0).toUpperCase() + section.slice(1)} section saved!`);
  } catch (e) {
    req.flash('error', 'Failed to save: ' + e.message);
  }
  res.redirect('/homepage');
});

module.exports = router;
