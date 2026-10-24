/**
 * Where the CMS keeps the things that must survive a redeploy.
 *
 * On Railway a volume is mounted and DATA_DIR points at it (e.g. /data):
 *   database → $DATA_DIR/data.db
 *   uploads  → $DATA_DIR/uploads
 * Locally (no DATA_DIR) everything stays next to the code, as before.
 * DB_PATH / UPLOADS_DIR can still override either one individually.
 */
const path = require('path');
const fs   = require('fs');

const DATA_DIR    = process.env.DATA_DIR || null;
const DB_PATH     = process.env.DB_PATH || (DATA_DIR ? path.join(DATA_DIR, 'data.db') : path.join(__dirname, '..', 'data.db'));
const UPLOADS_DIR = process.env.UPLOADS_DIR || (DATA_DIR ? path.join(DATA_DIR, 'uploads') : path.join(__dirname, '..', 'public', 'uploads'));

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

module.exports = { DATA_DIR, DB_PATH, UPLOADS_DIR };
