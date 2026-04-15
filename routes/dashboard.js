const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const db = require('../db');

router.use(auth);

router.get('/', (req, res) => {
  const stats = {
    posts: db.prepare('SELECT COUNT(*) as n FROM blog_posts').get().n,
    published: db.prepare("SELECT COUNT(*) as n FROM blog_posts WHERE status = 'published'").get().n,
    leads: db.prepare('SELECT COUNT(*) as n FROM leads').get().n,
    newLeads: db.prepare("SELECT COUNT(*) as n FROM leads WHERE status = 'new'").get().n,
    projects: db.prepare('SELECT COUNT(*) as n FROM portfolio').get().n,
    services: db.prepare('SELECT COUNT(*) as n FROM services').get().n,
  };
  const recentLeads = db.prepare('SELECT * FROM leads ORDER BY created_at DESC LIMIT 5').all();
  const recentPosts = db.prepare('SELECT * FROM blog_posts ORDER BY created_at DESC LIMIT 5').all();
  res.render('dashboard', { title: 'Dashboard', active: 'dashboard', stats, recentLeads, recentPosts });
});

module.exports = router;
