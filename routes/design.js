const express = require('express');
const router  = express.Router();
const auth    = require('../middleware/auth');
const db      = require('../db');
router.use(auth);

const upload = require('../utils/upload');

function get(key) {
  const row = db.prepare('SELECT data FROM homepage WHERE section=?').get(key);
  return row ? JSON.parse(row.data) : {};
}
function save(key, data) {
  db.prepare('INSERT OR REPLACE INTO homepage (section,data) VALUES (?,?)').run(key, JSON.stringify(data));
}

router.get('/', (req, res) => {
  res.render('design/index', {
    title: 'Design & Theme', active: 'design',
    site:  get('site'),
    theme: get('theme')
  });
});

// POST /design/identity — logo, site name, nav CTA
router.post('/identity', upload.single('logo_file'), (req, res) => {
  const site = get('site');
  if (req.file) site.logo = 'http://localhost:3000/uploads/' + req.file.filename;
  else if (req.body.logo) site.logo = req.body.logo;
  site.site_name    = req.body.site_name    || site.site_name    || '';
  site.nav_cta_text = req.body.nav_cta_text || site.nav_cta_text || '';
  site.nav_cta_url  = req.body.nav_cta_url  || site.nav_cta_url  || '';
  save('site', site);
  req.flash('success', 'Identity saved!');
  res.redirect('/design#identity');
});

// POST /design/colors — all CSS color variables
router.post('/colors', (req, res) => {
  const theme = get('theme');
  const keys = ['color_bg','color_bg_card','color_blue','color_blue_lt','color_green','color_pink','color_orange','color_purple','color_grey','color_grey_lt'];
  keys.forEach(k => { if (req.body[k]) theme[k] = req.body[k]; });
  if (req.body.border_opacity) theme.border_opacity = req.body.border_opacity;
  save('theme', theme);
  req.flash('success', 'Colors saved!');
  res.redirect('/design#colors');
});

// POST /design/fonts — heading + body font
router.post('/fonts', (req, res) => {
  const theme = get('theme');
  theme.heading_font = req.body.heading_font || theme.heading_font || 'Syne';
  theme.body_font    = req.body.body_font    || theme.body_font    || 'Urbanist';
  save('theme', theme);
  req.flash('success', 'Fonts saved!');
  res.redirect('/design#fonts');
});

module.exports = router;
