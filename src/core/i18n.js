import en from '../i18n/en.js';
import ja from '../i18n/ja.js';
import zh from '../i18n/zh.js';

// Interface language. The game starts in the device's language (Settings can pin one); text
// lives in src/i18n/<id>.js. Car, track and rival names stay as written everywhere - their
// descriptions are translated by id, falling back to the catalogue's own English.

const TABLES = { en, ja, zh };

/** The languages on offer, each named in its own script. */
export const LANGUAGES = [
  { id: 'en', name: 'English', lang: 'en', locale: 'en-US' },
  { id: 'ja', name: '日本語', lang: 'ja', locale: 'ja-JP' },
  { id: 'zh', name: '中文', lang: 'zh-CN', locale: 'zh-CN' },
];

let current = LANGUAGES[0];
let table = en;

/** The first of the device's preferred languages the game speaks (English if none). */
export function detectLanguage() {
  const prefs = navigator.languages?.length ? navigator.languages : [navigator.language];
  for (const p of prefs) {
    const tag = String(p || '').toLowerCase();
    const hit = LANGUAGES.find((l) => tag === l.id || tag.startsWith(`${l.id}-`));
    if (hit) return hit.id;
  }
  return 'en';
}

/** Switch to a language id, or 'auto' for the device's. Returns the id now in use. */
export function setLanguage(choice = 'auto') {
  const id = TABLES[choice] ? choice : detectLanguage();
  current = LANGUAGES.find((l) => l.id === id);
  table = TABLES[id];
  // lets CSS pick Japanese or Chinese glyph shapes and fonts
  document.documentElement.lang = current.lang;
  return id;
}

export const language = () => current.id;
export const locale = () => current.locale;

// {name} placeholders (one regex for every call)
const PARAM = /\{(\w+)\}/g;

/** Interface text for `key`, with {name} placeholders filled from `params`. */
export function t(key, params) {
  const s = table[key] ?? en[key];
  if (s === undefined) return key;
  if (typeof s === 'function') return s(params || {});
  return params ? s.replace(PARAM, (m, k) => (k in params ? params[k] : m)) : s;
}

/** Catalogue text: its translation under `key`, else the catalogue's own English. */
function tx(key, english) {
  return current.id === 'en' ? english : (table[key] ?? english);
}

// a car whose text came from a model manifest keeps it as written
export const carClass = (c) => (c.ownText ? c.class : tx(`car.${c.id}.class`, c.class));
export const carBlurb = (c) => (c.ownText ? c.blurb : tx(`car.${c.id}.blurb`, c.blurb));
export const trackTagline = (d) => tx(`track.${d.id}.tagline`, d.tagline);
export const itemName = (it) => tx(`item.${it.id}`, it.name);
