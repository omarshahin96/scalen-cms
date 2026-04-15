const express   = require('express');
const router    = express.Router();
const auth      = require('../middleware/auth');
const db        = require('../db');
const bcrypt    = require('bcryptjs');
const speakeasy = require('speakeasy');
const QRCode    = require('qrcode');

router.use(auth);

router.get('/', (req, res) => {
  const settings = db.prepare('SELECT * FROM settings ORDER BY group_name, key').all();
  const grouped = {};
  settings.forEach(s => {
    if (!grouped[s.group_name]) grouped[s.group_name] = [];
    grouped[s.group_name].push(s);
  });
  res.render('settings/index', { title: 'Settings', active: 'settings', grouped });
});

router.post('/', (req, res) => {
  const { settings } = req.body;
  if (settings) {
    const update = db.prepare('UPDATE settings SET value = ? WHERE key = ?');
    Object.entries(settings).forEach(([key, value]) => update.run(value, key));
  }
  req.flash('success', 'Settings saved!');
  res.redirect('/settings');
});

// Change password
router.get('/password', (req, res) => {
  res.render('settings/password', { title: 'Change Password', active: 'settings' });
});

router.post('/password', (req, res) => {
  const { current, newPass, confirm } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.session.userId);
  if (!bcrypt.compareSync(current, user.password)) {
    req.flash('error', 'Current password is incorrect.');
    return res.redirect('/settings/password');
  }
  if (newPass !== confirm) {
    req.flash('error', 'New passwords do not match.');
    return res.redirect('/settings/password');
  }
  if (newPass.length < 6) {
    req.flash('error', 'Password must be at least 6 characters.');
    return res.redirect('/settings/password');
  }
  db.prepare('UPDATE users SET password = ? WHERE id = ?').run(bcrypt.hashSync(newPass, 10), req.session.userId);
  req.flash('success', 'Password changed successfully!');
  res.redirect('/settings');
});

// ─── 2FA Setup ───────────────────────────────────────────────────────────────

router.get('/2fa', async (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.session.userId);

  if (user.totp_enabled) {
    // Already enabled — show management page (no QR)
    return res.render('settings/2fa', { title: 'Two-Factor Auth', active: 'settings', enabled: true, qrCode: null, secret: null });
  }

  // Generate a fresh secret each time they visit the setup page
  const secret = speakeasy.generateSecret({
    name:   `Scalen CMS (${user.email})`,
    length: 20
  });
  req.session.totp_temp = secret.base32;

  const qrCode = await QRCode.toDataURL(secret.otpauth_url);
  res.render('settings/2fa', {
    title: 'Two-Factor Auth', active: 'settings',
    enabled: false, qrCode, secret: secret.base32
  });
});

// POST /settings/2fa/enable — verify code then save secret
router.post('/2fa/enable', (req, res) => {
  const secret = req.session.totp_temp;
  if (!secret) {
    req.flash('error', 'Session expired. Please reload the page.');
    return res.redirect('/settings/2fa');
  }

  const { code } = req.body;
  const valid = speakeasy.totp.verify({
    secret, encoding: 'base32',
    token: (code || '').replace(/\s/g, ''),
    window: 1
  });

  if (!valid) {
    req.flash('error', 'Invalid code — please re-scan the QR code and try again.');
    return res.redirect('/settings/2fa');
  }

  db.prepare('UPDATE users SET totp_secret = ?, totp_enabled = 1 WHERE id = ?').run(secret, req.session.userId);
  delete req.session.totp_temp;
  req.flash('success', 'Two-factor authentication enabled!');
  res.redirect('/settings/2fa');
});

// POST /settings/2fa/disable — confirm password then disable
router.post('/2fa/disable', (req, res) => {
  const { password } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.session.userId);
  if (!bcrypt.compareSync(password, user.password)) {
    req.flash('error', 'Incorrect password.');
    return res.redirect('/settings/2fa');
  }
  db.prepare('UPDATE users SET totp_secret = NULL, totp_enabled = 0 WHERE id = ?').run(req.session.userId);
  req.flash('success', '2FA has been disabled.');
  res.redirect('/settings/2fa');
});

module.exports = router;
