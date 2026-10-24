/**
 * Shared secure multer configuration.
 * - Whitelists image MIME types only
 * - Generates safe filenames (no original name, no path traversal)
 * - Enforces 10 MB size limit
 */
const multer = require('multer');
const path   = require('path');
const fs     = require('fs');
const crypto = require('crypto');
const { UPLOADS_DIR } = require('./paths');

const ALLOWED_MIME = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/gif',
  'image/webp'
]);

const EXT_MAP = {
  'image/jpeg': '.jpg',
  'image/jpg':  '.jpg',
  'image/png':  '.png',
  'image/gif':  '.gif',
  'image/webp': '.webp'
};

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
    cb(null, UPLOADS_DIR);
  },
  // Safe filename: random hex + correct extension — no original name ever used
  filename: (req, file, cb) => {
    const ext  = EXT_MAP[file.mimetype] || '.jpg';
    const name = Date.now() + '-' + crypto.randomBytes(8).toString('hex') + ext;
    cb(null, name);
  }
});

const fileFilter = (req, file, cb) => {
  if (ALLOWED_MIME.has(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Only image files (JPEG, PNG, GIF, WebP) are allowed.'), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 10 * 1024 * 1024, files: 20 }
});

module.exports = upload;
