/**
 * Arabic content as sparse overrides on top of the English content.
 *
 * English is the base everywhere (sections, settings, table rows). Arabic stores
 * ONLY what differs from English, so anything not translated yet — or shared, like
 * images, URLs and numbers — falls back to English automatically, and later English
 * changes to shared fields reach the Arabic site too.
 *
 *   sections  → homepage table row "<name>@ar"   (e.g. "hero@ar")
 *   settings  → homepage table row "settings@ar" ({ key: value })
 *   rows      → translations column: {"ar": { field: override }}
 *
 * Arrays are stored as {"__array": length, "<index>": override} so each item
 * still falls back per field.
 */
const db = require('../db');

const LANGS = ['en', 'ar'];
const AR = 'ar';
const SUFFIX = '@' + AR;

// Fields that can differ per language. Everything else (status, order, images, ids…) is shared.
const ROW_FIELDS = {
  services:        ['title', 'description', 'features', 'detail'],
  portfolio:       ['title', 'category', 'client', 'description', 'results', 'detail'],
  blog_posts:      ['title', 'excerpt', 'content', 'author', 'read_time'],
  blog_categories: ['name'],
  team:            ['name', 'role', 'bio'],
  testimonials:    ['name', 'role', 'company', 'quote']
};
const JSON_FIELDS = new Set(['detail', 'features']);

const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const isEmpty = v => v === null || v === undefined || v === '';
const clone = v => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
const normLang = l => (l === AR ? AR : 'en');

/** What `value` changes relative to `base` (undefined when nothing differs). */
function diff(base, value) {
  if (value === undefined) return undefined;
  if (Array.isArray(value)) {
    if (!Array.isArray(base)) return clone(value);
    const out = { __array: value.length };
    let changed = value.length !== base.length;
    value.forEach((v, i) => {
      const d = diff(base[i], v);
      if (d !== undefined) { out[i] = d; changed = true; }
    });
    return changed ? out : undefined;
  }
  if (isObj(value)) {
    if (!isObj(base)) return clone(value);
    const out = {};
    for (const k of Object.keys(value)) {
      const d = diff(base[k], value[k]);
      if (d !== undefined) out[k] = d;
    }
    return Object.keys(out).length ? out : undefined;
  }
  // primitives — a form posts "5" for a stored 5, and "" for a stored null
  if (isEmpty(base) && isEmpty(value)) return undefined;
  if (base !== null && base !== undefined && typeof base !== 'object' && String(base) === String(value)) return undefined;
  return value;
}

/** English `base` with the Arabic `over` applied (over may come from diff()). */
function merge(base, over) {
  if (over === undefined) return clone(base);
  if (isObj(over) && Object.prototype.hasOwnProperty.call(over, '__array')) {
    const src = Array.isArray(base) ? base : [];
    const out = [];
    for (let i = 0; i < over.__array; i++) out.push(merge(src[i], over[i]));
    return out;
  }
  if (isObj(over)) {
    const out = isObj(base) ? clone(base) : {};
    for (const k of Object.keys(over)) out[k] = merge(out[k], over[k]);
    return out;
  }
  return clone(over);
}

// ─── Sections (homepage table) ───────────────────────────────────────────────
function readRaw(key) {
  const row = db.prepare('SELECT data FROM homepage WHERE section = ?').get(key);
  if (!row) return null;
  try { return JSON.parse(row.data); } catch { return null; }
}
function writeRaw(key, data) {
  db.prepare('INSERT OR REPLACE INTO homepage (section, data) VALUES (?, ?)').run(key, JSON.stringify(data));
}
function deleteRaw(key) {
  db.prepare('DELETE FROM homepage WHERE section = ?').run(key);
}

function getSection(name, lang) {
  const base = readRaw(name);
  if (normLang(lang) !== AR) return base;
  const over = readRaw(name + SUFFIX);
  return over === null ? base : merge(base, over);
}

/** English: replaces the section. Arabic: stores only what differs from English. */
function saveSection(name, data, lang) {
  if (normLang(lang) !== AR) return writeRaw(name, data);
  const d = diff(readRaw(name), data);
  if (d === undefined) deleteRaw(name + SUFFIX); else writeRaw(name + SUFFIX, d);
}

const isTranslationKey = section => section.includes('@');

// ─── Settings ────────────────────────────────────────────────────────────────
function getSettings(lang) {
  const out = {};
  db.prepare('SELECT key, value FROM settings').all().forEach(r => { out[r.key] = r.value; });
  if (normLang(lang) !== AR) return out;
  const over = readRaw('settings' + SUFFIX) || {};
  for (const [k, v] of Object.entries(over)) if (k in out) out[k] = v;
  return out;
}
function saveSettings(values, lang) {
  if (normLang(lang) !== AR) {
    const update = db.prepare('UPDATE settings SET value = ? WHERE key = ?');
    Object.entries(values).forEach(([k, v]) => update.run(v, k));
    return;
  }
  const base = getSettings('en');
  const over = readRaw('settings' + SUFFIX) || {};
  for (const [k, v] of Object.entries(values)) {
    if (!(k in base)) continue;
    const d = diff(base[k], v);
    if (d === undefined) delete over[k]; else over[k] = d;
  }
  if (Object.keys(over).length) writeRaw('settings' + SUFFIX, over); else deleteRaw('settings' + SUFFIX);
}

// ─── Table rows ──────────────────────────────────────────────────────────────
function parseJSON(v) {
  if (typeof v !== 'string') return v;
  const t = v.trim();
  if (!(t.startsWith('{') || t.startsWith('['))) return v;
  try { return JSON.parse(t); } catch { return v; }
}
function readTranslations(row) {
  if (!row || !row.translations) return {};
  try { return JSON.parse(row.translations) || {}; } catch { return {}; }
}

/** Row in the requested language; the internal `translations` column is never returned. */
function localizeRow(table, row, lang) {
  if (!row) return row;
  const out = Object.assign({}, row);
  delete out.translations;
  if (normLang(lang) !== AR) return out;
  const over = readTranslations(row)[AR] || {};
  for (const f of ROW_FIELDS[table] || []) {
    if (!(f in over)) continue;
    const base = row[f];
    if (JSON_FIELDS.has(f)) {
      const parsed = parseJSON(base);
      if (typeof parsed === 'object' && parsed !== null && typeof over[f] === 'object' && over[f] !== null) {
        const m = merge(parsed, over[f]);
        out[f] = typeof base === 'string' ? JSON.stringify(m) : m;
        continue;
      }
    }
    out[f] = merge(base, over[f]);
  }
  return out;
}
const localizeRows = (table, rows, lang) => rows.map(r => localizeRow(table, r, lang));

/** Arabic edit of a row: stores overrides for translatable fields only; English columns are untouched. */
function saveRowTranslation(table, id, fields) {
  const row = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id);
  if (!row) return false;
  const tr = readTranslations(row);
  const ar = tr[AR] || {};
  for (const f of ROW_FIELDS[table] || []) {
    if (!(f in fields)) continue;
    let base = row[f], value = fields[f];
    if (JSON_FIELDS.has(f)) { base = parseJSON(base); value = parseJSON(value); }
    const d = diff(base, value);
    if (d === undefined) delete ar[f]; else ar[f] = d;
  }
  if (Object.keys(ar).length) tr[AR] = ar; else delete tr[AR];
  db.prepare(`UPDATE ${table} SET translations = ? WHERE id = ?`).run(Object.keys(tr).length ? JSON.stringify(tr) : null, id);
  return true;
}

// ─── Request helpers ─────────────────────────────────────────────────────────
/** Admin: the language being edited (kept in the session). */
const contentLang = req => normLang(req.session && req.session.contentLang);
/** Public API: ?lang=ar */
const apiLang = req => normLang(req.query && req.query.lang);

module.exports = {
  LANGS, ROW_FIELDS, diff, merge,
  getSection, saveSection, isTranslationKey, readRaw,
  getSettings, saveSettings,
  localizeRow, localizeRows, saveRowTranslation,
  contentLang, apiLang
};
