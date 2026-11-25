// Checks locale files against dist/locales/catalog.json.
//
//   npm run i18n:check            every locale
//   node tools/i18n/check.mjs de  one locale
//
// A locale file is { "strings": { english: translation }, "templates": { english: translation } }.
// Every catalog entry must be translated, each template's {0}, {1} ... slots must all survive, and
// an all-caps English string stays all-caps in languages that have capitals.
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const DIR = join(ROOT, 'dist', 'locales');
const LOCALES = ['es', 'de', 'fr', 'zh', 'zh-TW', 'hi'];
const CASED = new Set(['es', 'de', 'fr']);

const catalog = JSON.parse(readFileSync(join(DIR, 'catalog.json'), 'utf8'));
const slots = text => [...text.matchAll(/\{(\d+)\}/g)].map(match => match[1]).sort().join(',');
const allCaps = text => /\p{Lu}/u.test(text) && !/\p{Ll}/u.test(text);

let failed = false;
for (const locale of process.argv.slice(2).length ? process.argv.slice(2) : LOCALES) {
  const file = join(DIR, locale + '.json');
  if (!existsSync(file)) {
    console.error(`${locale}: missing ${file}`);
    failed = true;
    continue;
  }
  const data = JSON.parse(readFileSync(file, 'utf8'));
  const problems = [];
  for (const section of ['strings', 'templates']) {
    const wanted = Object.keys(catalog[section]);
    const have = data[section] ?? {};
    for (const english of wanted) {
      const value = have[english];
      if (typeof value !== 'string' || !value.trim()) {
        problems.push(`untranslated ${section.slice(0, -1)}: ${english}`);
        continue;
      }
      if (slots(english) !== slots(value)) problems.push(`slots differ: ${english} -> ${value}`);
      if (CASED.has(locale) && allCaps(english) && /\p{L}{3}/u.test(english) && !allCaps(value)) problems.push(`not all caps: ${english} -> ${value}`);
    }
    for (const english of Object.keys(have)) if (!Object.hasOwn(catalog[section], english)) problems.push(`not in catalog: ${english}`);
  }
  const total = Object.keys(catalog.strings).length + Object.keys(catalog.templates).length;
  console.log(`${locale}: ${total - problems.filter(item => item.startsWith('untranslated')).length}/${total} translated, ${problems.length} problem(s)`);
  for (const problem of problems.slice(0, 40)) console.log('  ' + problem);
  if (problems.length) failed = true;
}
process.exitCode = failed ? 1 : 0;
