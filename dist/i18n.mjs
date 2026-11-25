// Localization. The game is written in English; every other language is a table from the English
// text to its translation (dist/locales/<id>.json, made from the catalog tools/i18n/extract.mjs
// collects). Text is translated where it is drawn: the canvas interface passes everything it
// measures and paints through translate(), so menus, HUD, briefings and reports all follow the
// operator's language without each module translating its own strings.
//
// translate() tries, in order: the exact text; the same text in capitals (HUD callouts are often
// upper-cased in code); templates for text built by concatenation ('Mission {0} of {1}'), whose
// slots are translated on their own; and finally the text split into sentences or "·"-separated
// parts. Anything it cannot place is shown in English. Results are cached.
//
// The language belongs to the operator profile (settings-store.mjs scopes the key), so switching
// operator switches language. Cinematics stay in English.

export const LANGUAGES = Object.freeze([
  Object.freeze({ id: 'en', name: 'English', english: 'English', html: 'en' }),
  Object.freeze({ id: 'es', name: 'Español', english: 'Spanish', html: 'es' }),
  Object.freeze({ id: 'de', name: 'Deutsch', english: 'German', html: 'de' }),
  Object.freeze({ id: 'fr', name: 'Français', english: 'French', html: 'fr' }),
  Object.freeze({ id: 'zh', name: '中文（简体）', english: 'Chinese (Simplified)', html: 'zh-CN' }),
  Object.freeze({ id: 'hi', name: 'हिन्दी', english: 'Hindi', html: 'hi' }),
]);
export const DEFAULT_LANGUAGE = 'en';
export const LANGUAGE_KEY = 'immune-protocol.language';
export const LANGUAGE_EVENT = 'immune-protocol:language';

export const isLanguage = id => LANGUAGES.some(language => language.id === id);
export const normalizeLanguage = id => isLanguage(id) ? id : DEFAULT_LANGUAGE;

// The browser's language, if the game speaks it; English otherwise.
export function preferredLanguage(list = globalThis.navigator?.languages ?? [globalThis.navigator?.language]) {
  for (const tag of list ?? []) {
    const base = String(tag ?? '').toLowerCase().split('-')[0];
    if (isLanguage(base)) return base;
  }
  return DEFAULT_LANGUAGE;
}

const CACHE_LIMIT = 6000;
const MAX_DEPTH = 3;
const SEPARATORS = [' · ', ' — ', ' – ', ' | ', '\n'];
// Scripts drawn without per-letter spacing (letter spacing breaks joined Devanagari and looks wrong
// in Chinese) and wrapped by character where there are no spaces.
const NON_LATIN = /[ऀ-ॿ　-〿㐀-鿿豈-﫿＀-￯]/;
export const CJK = /[　-〿㐀-鿿豈-﫿＀-￯]/;
export const isNonLatin = text => NON_LATIN.test(String(text ?? ''));

let current = DEFAULT_LANGUAGE;
let table = null;
const cache = new Map();

const escape = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const hasLower = text => /\p{Ll}/u.test(text);
const hasUpper = text => /\p{Lu}/u.test(text);
const allCaps = text => hasUpper(text) && !hasLower(text);

// Builds the lookup tables for one locale file ({ strings, templates }).
export function compileLocale(id, data) {
  const strings = new Map(Object.entries(data?.strings ?? {}).filter(([, value]) => typeof value === 'string' && value));
  const upper = new Map();
  for (const [english, value] of strings) {
    const key = english.toUpperCase();
    // An all-caps English entry is already the right translation for capitals; otherwise capitalise.
    if (allCaps(english)) upper.set(key, value);
    else if (!upper.has(key)) upper.set(key, value.toLocaleUpperCase(htmlTag(id)));
  }
  const templates = Object.entries(data?.templates ?? {})
    .filter(([, value]) => typeof value === 'string' && value)
    .map(([english, value]) => {
      const pieces = english.split(/\{(\d+)\}/);
      const literals = pieces.filter((_, index) => index % 2 === 0);
      const order = pieces.filter((_, index) => index % 2 === 1).map(Number);
      const pattern = literals.map(escape).join('(.+?)');
      return {
        english, value, order,
        exact: new RegExp('^' + pattern + '$', 'su'),
        caps: new RegExp('^' + literals.map(part => escape(part.toUpperCase())).join('(.+?)') + '$', 'su'),
        // The longest literal part, to rule a template out cheaply before trying its pattern.
        anchor: literals.reduce((best, part) => part.trim().length > best.length ? part.trim() : best, ''),
        weight: literals.join('').replace(/\s/g, '').length,
      };
    })
    .filter(template => template.anchor.length >= 2)
    .sort((a, b) => b.weight - a.weight);
  return { id, strings, upper, templates };
}

function htmlTag(id) {
  return LANGUAGES.find(language => language.id === id)?.html ?? 'en';
}

function fill(template, captures, depth, upper) {
  let output = template.value;
  template.order.forEach((slot, index) => {
    output = output.split('{' + slot + '}').join(lookup(captures[index], depth + 1) ?? captures[index]);
  });
  return upper ? output.toLocaleUpperCase(htmlTag(table.id)) : output;
}

// The translation of `text`, or null when it cannot be placed.
function lookup(text, depth = 0) {
  if (!table || depth > MAX_DEPTH) return null;
  const direct = table.strings.get(text);
  if (direct !== undefined) return direct;
  const trimmed = text.trim();
  if (!trimmed || !/\p{L}/u.test(trimmed)) return null;
  if (trimmed !== text) {
    const inner = lookup(trimmed, depth);
    return inner == null ? null : text.slice(0, text.indexOf(trimmed)) + inner + text.slice(text.indexOf(trimmed) + trimmed.length);
  }
  const caps = allCaps(text);
  if (caps) {
    const upper = table.upper.get(text);
    if (upper !== undefined) return upper;
  }
  for (const template of table.templates) {
    if (!text.includes(template.anchor) && !(caps && text.includes(template.anchor.toUpperCase()))) continue;
    let match = template.exact.exec(text);
    let upper = false;
    if (!match && caps) {
      match = template.caps.exec(text);
      upper = !!match;
    }
    if (match) return fill(template, match.slice(1), depth, upper && !allCaps(template.value));
  }
  for (const separator of SEPARATORS) {
    if (!text.includes(separator)) continue;
    const parts = text.split(separator);
    const translated = parts.map(part => lookup(part, depth + 1));
    if (translated.some(part => part != null)) return parts.map((part, index) => translated[index] ?? part).join(separator);
  }
  // Several sentences in one string.
  const sentences = text.split(/(?<=[.!?])\s+(?=\S)/);
  if (sentences.length > 1) {
    const translated = sentences.map(sentence => lookup(sentence, depth + 1));
    if (translated.some(sentence => sentence != null)) return sentences.map((sentence, index) => translated[index] ?? sentence).join(' ');
  }
  return null;
}

// The text in the current language (or unchanged). Safe to call on text that is already translated.
export function translate(text) {
  if (current === DEFAULT_LANGUAGE || !table || text == null || text === '') return text;
  const source = typeof text === 'string' ? text : String(text);
  const cached = cache.get(source);
  if (cached !== undefined) return cached;
  const result = lookup(source) ?? source;
  if (cache.size > CACHE_LIMIT) cache.clear();
  cache.set(source, result);
  // Translated text passed back in stays as it is.
  if (result !== source) cache.set(result, result);
  return result;
}
export const t = translate;

export function language() {
  return current;
}

export function languageInfo(id = current) {
  return LANGUAGES.find(item => item.id === id) ?? LANGUAGES[0];
}

// Installs an already loaded locale (tests and tools); `data` null means English.
export function useLocale(id, data) {
  current = normalizeLanguage(id);
  table = current === DEFAULT_LANGUAGE ? null : compileLocale(current, data);
  cache.clear();
  if (globalThis.document?.documentElement) globalThis.document.documentElement.lang = htmlTag(current);
  globalThis.dispatchEvent?.(new Event(LANGUAGE_EVENT));
}

const loaded = new Map();
// Fetches and switches to a language. Resolves once its text is in place; on a failed fetch the game
// stays in the language it had.
export async function setLanguage(id) {
  const next = normalizeLanguage(id);
  if (next === DEFAULT_LANGUAGE) {
    useLocale(next, null);
    return true;
  }
  try {
    if (!loaded.has(next)) {
      const response = await fetch(new URL('./locales/' + next + '.json', import.meta.url));
      if (!response.ok) throw new Error('HTTP ' + response.status);
      loaded.set(next, await response.json());
    }
    useLocale(next, loaded.get(next));
    return true;
  } catch (error) {
    console.warn('Could not load the ' + next + ' translation', error);
    return false;
  }
}

// Numbers in the current language's grouping (1,000 / 1.000 / 1 000).
export function formatNumber(value) {
  try { return Number(value).toLocaleString(htmlTag(current)); } catch { return String(value); }
}
