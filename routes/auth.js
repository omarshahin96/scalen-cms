const express   = require('express');
const router    = express.Router();
const bcrypt    = require('bcryptjs');
const speakeasy = require('speakeasy');
const rateLimit = require('express-rate-limit');
const db        = require('../db');

// Max 10 login attempts per 15 minutes per IP
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  skipSuccessfulRequests: true,
  message: 'Too many login attempts. Please try again in 15 minutes.',
  standardHeaders: true,
  legacyHeaders: false
});

// Max 5 TOTP guesses per 5 minutes per IP (TOTP brute-force protection)
const totpLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 5,
  skipSuccessfulRequests: true,
  message: 'Too many verification attempts. Please wait 5 minutes.',
  standardHeaders: true,
  legacyHeaders: false
});

// ─── Login ───────────────────────────────────────────────────────────────────

router.get('/login', (req, res) => {
  if (req.session.userId) return res.redirect('/dashboard');
  res.render('login', { title: 'Login' });
});

router.post('/login', loginLimiter, (req, res) => {
  const { email, password } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user || !bcrypt.compareSync(password, user.password)) {
    req.flash('error', 'Invalid email or password.');
    return res.redirect('/login');
  }

  // If 2FA is enabled, hold authentication and redirect to TOTP step
  if (user.totp_enabled && user.totp_secret) {
    req.session.pending2FA = {
      userId:  user.id,
      expires: Date.now() + 5 * 60 * 1000  // 5 minute window
    };
    return res.redirect('/login/verify');
  }

  // No 2FA — grant session immediately
  req.session.userId = user.id;
  req.session.user   = { id: user.id, name: user.name, email: user.email, role: user.role };
  res.redirect('/dashboard');
});

// ─── 2FA TOTP verification step ──────────────────────────────────────────────

router.get('/login/verify', (req, res) => {
  const p = req.session.pending2FA;
  if (!p) return res.redirect('/login');
  if (p.expires < Date.now()) {
    delete req.session.pending2FA;
    req.flash('error', 'Session expired. Please log in again.');
    return res.redirect('/login');
  }
  res.render('login-verify', { title: 'Two-Factor Authentication' });
});

router.post('/login/verify', totpLimiter, (req, res) => {
  const p = req.session.pending2FA;
  if (!p) return res.redirect('/login');
  if (p.expires < Date.now()) {
    delete req.session.pending2FA;
    req.flash('error', 'Session expired. Please log in again.');
    return res.redirect('/login');
  }

  const { code } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(p.userId);

  const valid = speakeasy.totp.verify({
    secret:   user.totp_secret,
    encoding: 'base32',
    token:    (code || '').replace(/\s/g, ''),
    window:   1   // ±30 s tolerance
  });

  if (!valid) {
    req.flash('error', 'Invalid authentication code. Please try again.');
    return res.redirect('/login/verify');
  }

  delete req.session.pending2FA;
  req.session.userId = user.id;
  req.session.user   = { id: user.id, name: user.name, email: user.email, role: user.role };
  res.redirect('/dashboard');
});

// ─── Logout ──────────────────────────────────────────────────────────────────

router.get('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/login'));
});

// Redirect root to dashboard
router.get('/', (req, res) => res.redirect('/dashboard'));

module.exports = router;
