const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const db = require('../db');
router.use(auth);

const upload = require('../utils/upload');

function slugify(str) {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

// LIST
router.get('/', (req, res) => {
  const { search, status, category } = req.query;
  let sql = `SELECT p.*, c.name as cat_name FROM blog_posts p LEFT JOIN blog_categories c ON p.category_id = c.id WHERE 1=1`;
  const params = [];
  if (search) { sql += ` AND (p.title LIKE ? OR p.excerpt LIKE ?)`; params.push(`%${search}%`, `%${search}%`); }
  if (status) { sql += ` AND p.status = ?`; params.push(status); }
  if (category) { sql += ` AND p.category_id = ?`; params.push(category); }
  sql += ` ORDER BY p.created_at DESC`;
  const posts = db.prepare(sql).all(...params);
  const categories = db.prepare('SELECT * FROM blog_categories ORDER BY name').all();
  res.render('blog/index', { title: 'Blog Posts', active: 'blog', posts, categories, query: req.query });
});

// CREATE FORM
router.get('/create', (req, res) => {
  const categories = db.prepare('SELECT * FROM blog_categories ORDER BY name').all();
  res.render('blog/form', { title: 'New Post', active: 'blog', post: null, categories });
});

// STORE
router.post('/', upload.single('image'), (req, res) => {
  const { title, category_id, excerpt, content, status, author, read_time } = req.body;
  const slug = slugify(title) + '-' + Date.now().toString(36);
  const image = req.file ? '/uploads/' + req.file.filename : null;
  const published_at = status === 'published' ? new Date().toISOString() : null;
  db.prepare(`INSERT INTO blog_posts (title, slug, category_id, excerpt, content, image, status, author, read_time, published_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(title, slug, category_id || null, excerpt, content, image, status || 'draft', author || 'Admin', read_time || '5 min read', published_at);
  req.flash('success', 'Post created successfully!');
  res.redirect('/blog');
});

// EDIT FORM
router.get('/:id/edit', (req, res) => {
  const post = db.prepare('SELECT * FROM blog_posts WHERE id = ?').get(req.params.id);
  if (!post) { req.flash('error', 'Post not found.'); return res.redirect('/blog'); }
  const categories = db.prepare('SELECT * FROM blog_categories ORDER BY name').all();
  res.render('blog/form', { title: 'Edit Post', active: 'blog', post, categories });
});

// UPDATE
router.put('/:id', upload.single('image'), (req, res) => {
  const { title, category_id, excerpt, content, status, author, read_time } = req.body;
  const post = db.prepare('SELECT * FROM blog_posts WHERE id = ?').get(req.params.id);
  if (!post) { req.flash('error', 'Post not found.'); return res.redirect('/blog'); }
  const image = req.file ? '/uploads/' + req.file.filename : post.image;
  const published_at = (status === 'published' && !post.published_at) ? new Date().toISOString() : post.published_at;
  db.prepare(`UPDATE blog_posts SET title=?, category_id=?, excerpt=?, content=?, image=?, status=?, author=?, read_time=?, published_at=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`)
    .run(title, category_id || null, excerpt, content, image, status, author, read_time, published_at, req.params.id);
  req.flash('success', 'Post updated successfully!');
  res.redirect('/blog');
});

// DELETE
router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM blog_posts WHERE id = ?').run(req.params.id);
  req.flash('success', 'Post deleted.');
  res.redirect('/blog');
});

// CATEGORIES
router.get('/categories', (req, res) => {
  const categories = db.prepare('SELECT c.*, COUNT(p.id) as post_count FROM blog_categories c LEFT JOIN blog_posts p ON p.category_id = c.id GROUP BY c.id ORDER BY c.name').all();
  res.render('blog/categories', { title: 'Blog Categories', active: 'blog', categories });
});
router.post('/categories', (req, res) => {
  const { name } = req.body;
  const slug = slugify(name);
  try { db.prepare('INSERT INTO blog_categories (name, slug) VALUES (?, ?)').run(name, slug); req.flash('success', 'Category added!'); }
  catch(e) { req.flash('error', 'Category slug already exists.'); }
  res.redirect('/blog/categories');
});
router.delete('/categories/:id', (req, res) => {
  db.prepare('DELETE FROM blog_categories WHERE id = ?').run(req.params.id);
  req.flash('success', 'Category deleted.');
  res.redirect('/blog/categories');
});

module.exports = router;
