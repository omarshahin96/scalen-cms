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

function save(section, data) {
  db.prepare('INSERT OR REPLACE INTO homepage (section, data) VALUES (?, ?)').run(section, JSON.stringify(data));
}

function uploadUrl(req, fieldname) {
  if (!req.files || !req.files.length) return null;
  const f = req.files.find(f => f.fieldname === fieldname);
  return f ? `http://localhost:3000/uploads/${f.filename}` : null;
}

// ─── ABOUT PAGE ────────────────────────────────────────────────────────────────
router.get('/about', (req, res) => {
  res.render('pages/about', {
    title: 'About Page Editor', active: 'pages_about',
    s: {
      page: getSection('about_page'),
      story: getSection('about_story'),
      values: getSection('about_values'),
      cta: getSection('about_cta')
    }
  });
});

const ABOUT_SECTIONS = ['about_page', 'about_story', 'about_values', 'about_cta'];

router.post('/about/:section', upload.any(), (req, res) => {
  const key = 'about_' + req.params.section;
  if (!ABOUT_SECTIONS.includes(key)) return res.redirect('/pages/about');
  try {
    let data;
    if (key === 'about_values') {
      const icons = [].concat(req.body.val_icon || []);
      const titles = [].concat(req.body.val_title || []);
      const descs = [].concat(req.body.val_desc || []);
      data = icons.map((ic, i) => ({ icon: ic, title: titles[i] || '', description: descs[i] || '' }));
    } else if (key === 'about_story') {
      const items = [].concat(req.body.item || []).filter(i => i.trim());
      data = {
        heading: req.body.heading || '',
        body1: req.body.body1 || '', body2: req.body.body2 || '',
        image: uploadUrl(req, 'image_file') || req.body.image || '',
        items,
        btn_text: req.body.btn_text || '', btn_url: req.body.btn_url || ''
      };
    } else {
      data = Object.assign({}, req.body);
      delete data._method;
    }
    save(key, data);
    req.flash('success', 'About page section saved!');
  } catch (e) { req.flash('error', e.message); }
  res.redirect('/pages/about');
});

// ─── SERVICES PAGE ─────────────────────────────────────────────────────────────
router.get('/services', (req, res) => {
  res.render('pages/services', {
    title: 'Services Page Editor', active: 'pages_services',
    s: {
      page: getSection('services_page'),
      featured: getSection('services_featured'),
      pricing: getSection('services_pricing'),
      cta: getSection('services_cta')
    }
  });
});

const SERVICES_SECTIONS = ['services_page', 'services_featured', 'services_pricing', 'services_cta'];

router.post('/services/:section', upload.any(), (req, res) => {
  const key = 'services_' + req.params.section;
  if (!SERVICES_SECTIONS.includes(key)) return res.redirect('/pages/services');
  try {
    let data;
    if (key === 'services_featured') {
      const labels   = [].concat(req.body.sf_label || []);
      const headings = [].concat(req.body.sf_heading || []);
      const bodies   = [].concat(req.body.sf_body || []);
      const btn_texts = [].concat(req.body.sf_btn_text || []);
      const btn_urls  = [].concat(req.body.sf_btn_url || []);
      const images    = [].concat(req.body.sf_image || []);
      // Features come as sf_features_0, sf_features_1, etc.
      data = labels.map((lbl, i) => {
        const featureKey = `sf_features_${i}`;
        const features = [].concat(req.body[featureKey] || []).filter(f => f.trim());
        const imgUpload = uploadUrl(req, `sf_image_file_${i}`);
        return {
          label: lbl, heading: headings[i] || '', body: bodies[i] || '',
          image: imgUpload || images[i] || '',
          features,
          btn_text: btn_texts[i] || '', btn_url: btn_urls[i] || ''
        };
      });
    } else if (key === 'services_pricing') {
      const names    = [].concat(req.body.plan_name || []);
      const prices   = [].concat(req.body.plan_price || []);
      const periods  = [].concat(req.body.plan_period || []);
      const populars = [].concat(req.body.plan_popular || []);
      const btn_texts = [].concat(req.body.plan_btn_text || []);
      const btn_urls  = [].concat(req.body.plan_btn_url || []);
      const plans = names.map((name, i) => {
        const featTexts = [].concat(req.body[`plan_feat_text_${i}`] || []);
        const featInc   = [].concat(req.body[`plan_feat_inc_${i}`] || []);
        const features = featTexts.map((text, j) => ({ text, included: featInc[j] === '1' }));
        return {
          name, price: prices[i] || '', period: periods[i] || '',
          popular: populars[i] === '1', btn_text: btn_texts[i] || '', btn_url: btn_urls[i] || '',
          features
        };
      });
      data = {
        heading: req.body.pricing_heading || '',
        description: req.body.pricing_desc || '',
        plans
      };
    } else {
      data = Object.assign({}, req.body);
      delete data._method;
    }
    save(key, data);
    req.flash('success', 'Services page section saved!');
  } catch (e) { req.flash('error', e.message); }
  res.redirect('/pages/services');
});

// ─── CONTACT PAGE ──────────────────────────────────────────────────────────────
router.get('/contact', (req, res) => {
  res.render('pages/contact', {
    title: 'Contact Page Editor', active: 'pages_contact',
    s: {
      page: getSection('contact_page'),
      office: getSection('contact_office'),
      faqs: getSection('contact_faqs'),
      social: getSection('contact_social')
    }
  });
});

const CONTACT_SECTIONS = ['contact_page', 'contact_office', 'contact_faqs', 'contact_social'];

router.post('/contact/:section', upload.any(), (req, res) => {
  const key = 'contact_' + req.params.section;
  if (!CONTACT_SECTIONS.includes(key)) return res.redirect('/pages/contact');
  try {
    let data;
    if (key === 'contact_faqs') {
      const qs = [].concat(req.body.faq_q || []);
      const as = [].concat(req.body.faq_a || []);
      data = qs.map((q, i) => ({ question: q, answer: as[i] || '' })).filter(f => f.question.trim());
    } else {
      data = Object.assign({}, req.body);
      delete data._method;
    }
    save(key, data);
    req.flash('success', 'Contact page section saved!');
  } catch (e) { req.flash('error', e.message); }
  res.redirect('/pages/contact');
});

// ─── PORTFOLIO PAGE ──────────────────────────────────────────────────────────
router.get('/portfolio', (req, res) => {
  const pp       = getSection('portfolio_page') || {};
  const projects = db.prepare('SELECT * FROM portfolio ORDER BY sort_order, id').all();
  res.render('pages/portfolio', {
    title: 'Portfolio Page Editor', active: 'pages_portfolio',
    projects,
    s: {
      hero: pp.hero || {},
      results_label: pp.results_label || '',
      results_heading: pp.results_heading || '',
      results_description: pp.results_description || '',
      case_studies: pp.case_studies || [],
      cta: pp.cta || {}
    }
  });
});

router.post('/portfolio/:section', upload.any(), (req, res) => {
  const pp = getSection('portfolio_page') || {};
  try {
    const sec = req.params.section;
    if (sec === 'hero') {
      pp.hero = { title: req.body.title || '', description: req.body.description || '' };
    } else if (sec === 'results') {
      pp.results_label       = req.body.results_label || '';
      pp.results_heading     = req.body.results_heading || '';
      pp.results_description = req.body.results_description || '';
    } else if (sec === 'case_studies') {
      const tags      = [].concat(req.body.cs_tag      || []);
      const titles    = [].concat(req.body.cs_title    || []);
      const descs     = [].concat(req.body.cs_desc     || []);
      const imgs      = [].concat(req.body.cs_image    || []);
      const slugs     = [].concat(req.body.cs_slug     || []);
      const btnTexts  = [].concat(req.body.cs_btn_text || []);
      const btnUrls   = [].concat(req.body.cs_btn_url  || []);
      pp.case_studies = tags.map((tag, i) => {
        const imgUp = uploadUrl(req, `cs_image_file_${i}`);
        const stats = [];
        for (let j = 0; j < 3; j++) {
          const num   = (req.body[`cs_stat_num_${i}_${j}`]   || '').trim();
          const label = (req.body[`cs_stat_label_${i}_${j}`] || '').trim();
          if (num || label) stats.push({ num, label });
        }
        return { image: imgUp || imgs[i] || '', tag, slug: slugs[i] || '', title: titles[i] || '', description: descs[i] || '', stats, btn_text: btnTexts[i] || '', btn_url: btnUrls[i] || '' };
      });
    } else if (sec === 'cta') {
      pp.cta = { heading: req.body.heading || '', description: req.body.description || '', btn1_text: req.body.btn1_text || '', btn1_url: req.body.btn1_url || '', btn2_text: req.body.btn2_text || '', btn2_url: req.body.btn2_url || '' };
    }
    save('portfolio_page', pp);
    req.flash('success', 'Portfolio page saved!');
  } catch (e) { req.flash('error', e.message); }
  res.redirect('/pages/portfolio');
});

// ─── BLOG PAGE ───────────────────────────────────────────────────────────────
router.get('/blog', (req, res) => {
  const bp = getSection('blog_page') || {};
  res.render('pages/blog', {
    title: 'Blog Page Editor', active: 'pages_blog',
    s: {
      hero: bp.hero || {},
      sidebar_cta: bp.sidebar_cta || {}
    }
  });
});

router.post('/blog/hero', (req, res) => {
  const bp = getSection('blog_page') || {};
  bp.hero = { title: req.body.title || '', description: req.body.description || '' };
  save('blog_page', bp);
  req.flash('success', 'Blog page hero saved!');
  res.redirect('/pages/blog');
});

router.post('/blog/sidebar_cta', (req, res) => {
  const bp = getSection('blog_page') || {};
  bp.sidebar_cta = {
    heading: req.body.heading || '',
    description: req.body.description || '',
    btn_text: req.body.btn_text || '',
    btn_url: req.body.btn_url || ''
  };
  save('blog_page', bp);
  req.flash('success', 'Blog sidebar CTA saved!');
  res.redirect('/pages/blog');
});

module.exports = router;
