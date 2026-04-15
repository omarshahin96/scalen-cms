const express       = require('express');
const session       = require('express-session');
const flash         = require('connect-flash');
const methodOverride= require('method-override');
const path          = require('path');
const helmet        = require('helmet');

const app  = express();
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
    sameSite: 'strict',      // blocks cross-site request forgery
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
  console.log(`\n  ✅ Scalen CMS running at http://localhost:${PORT}\n`);
});
