const express       = require('express');
const session       = require('express-session');
const flash         = require('connect-flash');
const methodOverride= require('method-override');
const path          = require('path');
const helmet        = require('helmet');

const app  = express();
app.set("trust proxy", 1); // Render runs behind a proxy
const PORT = process.env.PORT || 3000;

// ─── SECURITY HEADERS ────────────────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: false,  // disabled so CDN scripts (FA, Google Fonts) work in dashboard
  crossOriginEmbedderPolicy: false
}));

// ─── VIEW ENGINE ────────────────────────────────────────────────────────────
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// ─── MIDDLEWARE ─────────────────────────────────────────────────────────────
const { UPLOADS_DIR, DB_PATH } = require('./utils/paths');
// Images are shown on scalen.marketing (another origin) — helmet's default
// Cross-Origin-Resource-Policy: same-origin would make browsers block them.
app.use('/uploads', (req, res, next) => { res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin'); next(); });
app.use('/uploads', express.static(UPLOADS_DIR));   // persistent volume on Railway
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));
app.use(express.json({ limit: '2mb' }));
app.use(methodOverride('_method'));

// Session — use env var for secret; cookie is httpOnly + sameSite strict
const SESSION_SECRET = process.env.SESSION_SECRET || (() => {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('SESSION_SECRET environment variable must be set in production');
  }
  // Dev fallback — warn loudly
  console.warn('\n  ⚠️  SESSION_SECRET not set. Set SESSION_SECRET env var before deploying.\n');
  return 'dev-only-replace-before-deploy-' + Math.random().toString(36);
})();

app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,          // JS cannot read the cookie
    sameSite: 'lax',      // blocks cross-site request forgery
    secure: process.env.NODE_ENV === 'production', // HTTPS-only in prod
    maxAge: 24 * 60 * 60 * 1000
  }
}));
app.use(flash());

// Make flash + user + global data available in all views
app.use((req, res, next) => {
  res.locals.success = req.flash('success');
  res.locals.error   = req.flash('error');
  res.locals.user    = req.session.user || null;
  if (req.session.userId) {
    const db = require('./db');
    res.locals.newLeadCount = db.prepare("SELECT COUNT(*) as n FROM leads WHERE status = 'new'").get().n;
  } else {
    res.locals.newLeadCount = 0;
  }
  next();
});

// ─── ROUTES ─────────────────────────────────────────────────────────────────
app.use('/', require('./routes/auth'));
app.use('/dashboard',   require('./routes/dashboard'));
app.use('/blog',        require('./routes/blog'));
app.use('/services',    require('./routes/services'));
app.use('/portfolio',   require('./routes/portfolio'));
app.use('/testimonials',require('./routes/testimonials'));
app.use('/team',        require('./routes/team'));
app.use('/settings',    require('./routes/settings'));
app.use('/homepage',    require('./routes/homepage'));
app.use('/pages',       require('./routes/pages'));
app.use('/design',      require('./routes/design'));
app.use('/api',         require('./routes/api'));

app.use('/leads', require('./routes/leads'));

// 404
app.use((req, res) => res.status(404).render('404'));

// ─── START ──────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n  ✅ Scalen CMS running at http://localhost:${PORT}`);
  console.log(`     database: ${DB_PATH}\n     uploads:  ${UPLOADS_DIR}\n`);
});

// ─── STARTUP: one-time content import ───────────────────────────────────────
// Set IMPORT_FROM to another CMS's URL (e.g. https://scalen-cms.onrender.com) to
// copy its content + uploaded images here. Runs once per source; see the script.
if (process.env.IMPORT_FROM) {
  const db = require('./db');
  require('./scripts/import-from-cms')(process.env.IMPORT_FROM, db)
    .then(r => console.log('  📥 Content import:', JSON.stringify(r)))
    .catch(e => console.error('  ⚠️  Content import failed (nothing changed):', e.message));
}

// ─── STARTUP: admin login ────────────────────────────────────────────────────
// - First boot (no admin@scalen.com yet): create it. Password = ADMIN_PASS if set,
//   otherwise a random one printed ONCE in the deploy logs — log in with it and
//   change it from Settings → Change Password.
// - After that the password is managed from the CMS and is never overwritten on
//   restart. Setting ADMIN_PASS to a NEW value resets it once (a recovery switch).
(function setupAdminLogin() {
  try {
    const db     = require('./db');
    const bcrypt = require('bcryptjs');
    const crypto = require('crypto');
    db.exec('CREATE TABLE IF NOT EXISTS migrations (name TEXT PRIMARY KEY, ran_at DATETIME DEFAULT CURRENT_TIMESTAMP)');
    const envPass = process.env.ADMIN_PASS || '';
    const marker  = envPass ? 'admin_pass:' + crypto.createHash('sha256').update(envPass).digest('hex').slice(0, 16) : null;
    const admin   = db.prepare("SELECT id FROM users WHERE email='admin@scalen.com'").get();

    if (!admin) {
      const pass = envPass || crypto.randomBytes(12).toString('base64url');
      db.prepare("INSERT INTO users (name, email, password, role) VALUES ('Admin', 'admin@scalen.com', ?, 'admin')").run(bcrypt.hashSync(pass, 10));
      if (marker) db.prepare('INSERT OR IGNORE INTO migrations (name) VALUES (?)').run(marker);
      if (envPass) console.log('  🔑 Admin created (admin@scalen.com) with ADMIN_PASS.');
      else console.log(`\n  🔑 Admin created — email: admin@scalen.com   first-login password: ${pass}\n     Change it after logging in: Settings → Change Password.\n`);
    } else if (marker && !db.prepare('SELECT 1 FROM migrations WHERE name=?').get(marker)) {
      db.prepare("UPDATE users SET password=? WHERE id=?").run(bcrypt.hashSync(envPass, 10), admin.id);
      db.prepare('INSERT INTO migrations (name) VALUES (?)').run(marker);
      console.log('  🔑 Admin password reset from ADMIN_PASS (applies once; later changes in the CMS are kept).');
    }

    // Remove the template's public default login while it still has its default password
    const tmpl = db.prepare("SELECT id, password FROM users WHERE email='admin@reliable.com'").get();
    if (tmpl && bcrypt.compareSync('admin123', tmpl.password)) {
      db.prepare('DELETE FROM users WHERE id=?').run(tmpl.id);
      console.log('  🔒 Removed default template login (admin@reliable.com).');
    }
  } catch (e) {
    console.warn('  ⚠️  Admin setup skipped:', e.message);
  }
})();
