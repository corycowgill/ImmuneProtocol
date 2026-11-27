// Collects every English string the game can show into dist/locales/catalog.json, the list
// translators work from.
//
//   npm run i18n:extract
//
// Sources: text and labels in dist/index.html, and string literals in the game's modules. A string
// built by concatenation ('Mission ' + n + ' of ' + total) or a template literal becomes a template
// with numbered slots ('Mission {0} of {1}'); i18n.mjs matches shown text against those templates
// and translates whatever fills the slots on its own. Identifiers, selectors, paths, colours,
// shader code and other strings that are never shown are left out by the filters below.
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'acorn';
import { ancestor } from 'acorn-walk';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const DIST = join(ROOT, 'dist');

// Modules that hold shader source, renderer internals or tooling rather than words players read.
const SKIP_MODULES = new Set([
  'post-fx.mjs', 'surface-fx.mjs', 'hazard-fx.mjs', 'shot-fx.mjs', 'impact-fx.mjs', 'death-fx.mjs', 'explosions.mjs',
  'level-details.mjs', 'level-props.mjs', 'organ-world.mjs', 'arena-scene.mjs', 'heart-valve.mjs', 'mega-virus.mjs', 'terrain-view.mjs', 'ground-fx.mjs', 'weapon-skins.mjs', 'gpu-idle.mjs', 'render-scale.mjs',
  'arena-textures.mjs', 'bio-textures.mjs', 'decor-chunks.mjs', 'asset-loading.mjs', 'i18n.mjs', 'ai-debug.mjs',
  'tactical-ai.mjs', 'ai-navigation.mjs', 'ui-theme.mjs', 'ai-profiles.mjs', 'coop-protocol.mjs', 'settings-store.mjs',
]);
// Calls whose string arguments are never shown.
const SILENT_CALLS = new Set([
  'getElementById', 'byId', 'querySelector', 'querySelectorAll', 'closest', 'matches', 'getAttribute', 'setAttribute',
  'removeAttribute', 'hasAttribute', 'toggleAttribute', 'addEventListener', 'removeEventListener', 'createElement',
  'createElementNS', 'add', 'remove', 'toggle', 'contains', 'getPropertyValue', 'setProperty', 'playSample', 'getObjectByName',
  'readSetting', 'writeSetting', 'postMessage', 'send', 'load', 'fetch', 'URL', 'Error', 'warn', 'log', 'error', 'info', 'debug',
  'startsWith', 'endsWith', 'includes', 'indexOf', 'split', 'replace', 'join', 'padStart', 'get', 'set', 'has', 'delete',
  'emit', 'on', 'dispatchEvent', 'Event', 'CustomEvent', 'requestPointerLock', 'canPlayType', 'matchMedia', 'getContext',
  'svg', 'initTexture', 'loadTexture', 'loadModel', 'extendShader',
]);

const letters = text => (text.match(/\p{L}/gu) ?? []).length;

// Whether a literal reads like words a player would see.
function shown(text) {
  const value = text.trim();
  if (letters(value) < 2 || value.length > 900) return false;
  if (/[{}]|;\s*$|;\s*\w+\s*[=(]|=>|\b(?:vec[234]|uniform|varying|gl_|texture2D|#include|void main)\b/.test(value)) return false;
  if (/^[#.]?[\w-]+(?:[:.#\[\]=@>~+ ][\w"'=\-\]]*)*$/.test(value) && !/\s/.test(value) && !/^[A-Z][a-z]/.test(value) && !/^[A-Z]{3,}$/.test(value)) return false;
  if (/^(?:[a-z]+:)?[\w./-]+\.(?:mjs|js|glb|webp|png|jpg|mp4|mp3|ogg|json|woff2|css|svg)(?:[?#].*)?$/.test(value)) return false;
  if (/^(?:rgba?|hsla?)\(|^#[0-9a-f]{3,8}$|^\d+(?:\.\d+)?(?:px|em|rem|%|s|ms|deg|vh|vw)?(?: \d+(?:\.\d+)?(?:px|em|%)?)*$/i.test(value)) return false;
  if (/^\d{3} \d+px |^\d+px |^(?:bold|italic|normal) \d/.test(value)) return false;
  if (/^[\w-]+(?:\/[\w.-]+)+$/.test(value)) return false;
  if (/^[a-z][a-zA-Z0-9]*$/.test(value) && !/\s/.test(value)) return false;
  if (/^[a-z0-9]+(?:[-_:][a-z0-9]+)+$/.test(value)) return false;
  if (/^(?:immune-protocol|dom|media|@|data-|aria-|--)/.test(value)) return false;
  if (/^[#.\[]|\bbutton$|\[data-|", "|\*|\b(?:sin|cos|atan|mix|clamp|smoothstep|position|uv)\(/.test(value)) return false;
  if (/^\.\/|^https?:/.test(value)) return false;
  // SVG path data for drawn icons ('M4 12h15M14 6l6 6-6 6').
  if (/^[Mm][\d.\s,-]/.test(value) && /^[MmLlHhVvCcSsQqTtAaZz\d.\s,-]+$/.test(value)) return false;
  if (/<\/?[a-z][^>]*>|^[|:]/.test(value)) return false;
  // Keyboard event codes, wave lane patterns and CSS transform fragments.
  if (/^(?:Key[A-Z]|Digit\d|Arrow(?:Up|Down|Left|Right)$|(?:Shift|Control|Alt|Meta)(?:Left|Right)$|Numpad)|^[LRC]{3,}$|^assets\/|\($|^px[,)]$|^[a-z]+,$/.test(value)) return false;
  return true;
}

const strings = new Map();
const templates = new Map();
function note(map, text, where) {
  const value = text.replace(/\s+/g, ' ').trim();
  if (!value) return;
  if (!map.has(value)) map.set(value, new Set());
  map.get(value).add(where);
}

const hasString = node => node.type === 'Literal' ? typeof node.value === 'string'
  : node.type === 'BinaryExpression' && node.operator === '+' && (hasString(node.left) || hasString(node.right));

// Flattens a + b + c into its operands, left to right. Arithmetic with no text in it ((n + 1))
// stays one operand, one slot.
function operands(node, out = []) {
  if (node.type === 'BinaryExpression' && node.operator === '+' && hasString(node)) {
    operands(node.left, out);
    operands(node.right, out);
  } else out.push(node);
  return out;
}

const isString = node => node.type === 'Literal' && typeof node.value === 'string';

function calleeName(node) {
  const callee = node.callee;
  if (callee.type === 'Identifier') return callee.name;
  if (callee.type === 'MemberExpression' && !callee.computed) return callee.property.name;
  return null;
}

function silenced(ancestors) {
  for (let index = ancestors.length - 2; index >= 0; index--) {
    const parent = ancestors[index];
    const child = ancestors[index + 1];
    if ((parent.type === 'CallExpression' || parent.type === 'NewExpression') && parent.arguments.includes(child)) {
      // console.warn is silent; a boss's warn(boss, 'CHARGING · SIDESTEP') is shown on the HUD.
      if (calleeName(parent) === 'warn') return parent.callee.type === 'MemberExpression' && parent.callee.object?.name === 'console';
      if (SILENT_CALLS.has(calleeName(parent))) return true;
      return false;
    }
    // Module paths in import and export statements (not the exported data itself).
    if ((parent.type === 'ImportDeclaration' || parent.type === 'ExportNamedDeclaration' || parent.type === 'ExportAllDeclaration' ||
      parent.type === 'ImportExpression') && parent.source === child) return true;
    if (parent.type === 'Property' && parent.key === child && !parent.computed) return true;
    if (parent.type === 'MemberExpression' && parent.property === child) return true;
    if (parent.type === 'SwitchCase' && parent.test === child) return true;
    if (parent.type === 'BinaryExpression' && ['===', '!==', '==', '!=', 'in', 'instanceof'].includes(parent.operator)) return true;
  }
  return false;
}

function templateOf(parts) {
  let slot = 0;
  let text = '';
  let words = '';
  let previous = null;
  for (const part of parts) {
    // Two values side by side show as one run of text: one slot.
    if (part.literal == null && previous && previous.literal == null) continue;
    previous = part;
    if (part.literal != null) {
      text += part.literal;
      words += part.literal;
    } else text += '{' + slot++ + '}';
  }
  return slot && letters(words) >= 3 ? text.replace(/\s+/g, ' ').trim() : null;
}

function scanModule(file) {
  const source = readFileSync(join(DIST, file), 'utf8');
  const tree = parse(source, { ecmaVersion: 'latest', sourceType: 'module', allowHashBang: true });
  const inConcat = new WeakSet();
  ancestor(tree, {
    BinaryExpression(node, ancestors) {
      if (node.operator !== '+') return;
      const parent = ancestors[ancestors.length - 2];
      if (parent?.type === 'BinaryExpression' && parent.operator === '+') return;
      const list = operands(node);
      if (!list.some(isString)) return;
      for (const item of list) if (isString(item)) inConcat.add(item);
      if (silenced(ancestors)) return;
      const template = templateOf(list.map(item => ({ literal: isString(item) ? item.value : null })));
      if (template && shown(template.replace(/\{\d+\}/g, 'x'))) note(templates, template, file);
      // Every literal piece of a concatenation can also be shown on its own elsewhere.
      for (const item of list) if (isString(item) && shown(item.value) && /\s|^[A-Z]/.test(item.value.trim())) note(strings, item.value, file);
    },
    TemplateLiteral(node, ancestors) {
      if (ancestors.some(item => item.type === 'TaggedTemplateExpression') || silenced(ancestors)) return;
      const parts = [];
      node.quasis.forEach((quasi, index) => {
        parts.push({ literal: quasi.value.cooked });
        if (index < node.expressions.length) parts.push({ literal: null });
      });
      if (!node.expressions.length) {
        if (shown(node.quasis[0].value.cooked)) note(strings, node.quasis[0].value.cooked, file);
        return;
      }
      const template = templateOf(parts);
      if (template && shown(template.replace(/\{\d+\}/g, 'x'))) note(templates, template, file);
    },
    Literal(node, ancestors) {
      if (!isString(node) || inConcat.has(node) || silenced(ancestors)) return;
      if (shown(node.value)) note(strings, node.value, file);
    },
  });
}

// Text nodes and shown attributes in the page.
function scanHtml(file) {
  const html = readFileSync(join(DIST, file), 'utf8')
    .replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<svg[\s\S]*?<\/svg>/gi, '');
  for (const match of html.matchAll(/(?:aria-label|placeholder|title|alt)="([^"]+)"/g)) {
    if (shown(match[1])) note(strings, decode(match[1]), file);
  }
  for (const match of html.matchAll(/>([^<>]+)</g)) {
    const text = decode(match[1]);
    if (shown(text)) note(strings, text, file);
  }
  // Each element's whole text, as the interface reads it (a heading with an inline <span> or <b>).
  for (const match of html.matchAll(/<(h[1-6]|p|strong|span|small|li|dt|dd|label|button|option|summary|em|b)\b[^>]*>((?:(?!<\/?\1\b)[\s\S])*?)<\/\1>/g)) {
    const inner = match[2];
    if (!/<(?:b|span|strong|em|kbd|i)\b/.test(inner) || /<(?:div|p|ul|ol|li|button|img)\b/.test(inner)) continue;
    const text = decode(inner.replace(/<[^>]+>/g, ' '));
    if (shown(text)) note(strings, text, file);
  }
}

function decode(text) {
  return text.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ').replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code))).replace(/\s+/g, ' ').trim();
}

for (const file of readdirSync(DIST).filter(name => name.endsWith('.mjs') && !SKIP_MODULES.has(name))) scanModule(file);
scanHtml('index.html');

// Templates that are only a slot and punctuation would match anything; CSS values are never shown.
for (const template of templates.keys()) {
  if (letters(template.replace(/\{\d+\}/g, '')) < 3 || /^(?:scale|translate|rotate|rgba?|url)\w*\(|px\b|\.\/|\.wav$/.test(template)) templates.delete(template);
}

const sorted = map => Object.fromEntries([...map.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([text, where]) => [text, [...where].sort().join(',')]));
const catalog = { strings: sorted(strings), templates: sorted(templates) };
writeFileSync(join(DIST, 'locales', 'catalog.json'), JSON.stringify(catalog, null, 1) + '\n');
console.log(`${strings.size} strings and ${templates.size} templates written to dist/locales/catalog.json`);
