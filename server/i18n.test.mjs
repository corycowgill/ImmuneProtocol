import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { LANGUAGES, preferredLanguage, translate, useLocale } from '../dist/i18n.mjs';
import { lines } from '../dist/ui-core.mjs';

const SAMPLE = {
  strings: {
    'Wave contained': 'Oleada contenida',
    'WAVE CONTAINED': 'OLEADA CONTENIDA',
    'Lymph Node': 'Ganglio linfático',
    'Start campaign': 'Iniciar campaña',
    'Reload and repair tissue.': 'Recarga y repara el tejido.',
    'Your suit failed.': 'Tu traje ha fallado.',
    'Endless': 'Sin fin',
  },
  templates: {
    'Mission {0} of {1}': 'Misión {0} de {1}',
    '{0} tissue failed under pathogen attack.': 'El tejido de {0} cayó ante los patógenos.',
    'Best: wave {0}': 'Récord: oleada {0}',
  },
};

test('English needs no table and passes everything through', () => {
  useLocale('en', null);
  assert.equal(translate('Start campaign'), 'Start campaign');
  assert.equal(translate(''), '');
  assert.equal(translate(null), null);
});

test('exact text, capitals, templates, separators and sentences', () => {
  useLocale('es', SAMPLE);
  assert.equal(translate('Start campaign'), 'Iniciar campaña');
  assert.equal(translate('  Start campaign '), '  Iniciar campaña ');
  // Upper-cased in code: an all-caps entry wins, otherwise the translation is capitalised.
  assert.equal(translate('WAVE CONTAINED'), 'OLEADA CONTENIDA');
  assert.equal(translate('LYMPH NODE'), 'GANGLIO LINFÁTICO');
  // Template slots are translated on their own.
  assert.equal(translate('Mission 8 of 10'), 'Misión 8 de 10');
  assert.equal(translate('Lymph Node tissue failed under pathogen attack.'), 'El tejido de Ganglio linfático cayó ante los patógenos.');
  assert.equal(translate('MISSION 3 OF 10'), 'MISIÓN 3 DE 10');
  assert.equal(translate('Endless · Best: wave 4'), 'Sin fin · Récord: oleada 4');
  assert.equal(translate('Your suit failed. Reload and repair tissue.'), 'Tu traje ha fallado. Recarga y repara el tejido.');
  // Unknown text stays English; translated text passed back in is left alone.
  assert.equal(translate('Unheard of phrase'), 'Unheard of phrase');
  assert.equal(translate('Iniciar campaña'), 'Iniciar campaña');
  assert.equal(translate(1234), '1234');
  useLocale('en', null);
});

test('Chinese wraps between characters; other scripts between words', () => {
  useLocale('zh', { strings: { 'Start campaign': '开始战役，从血液到大脑' }, templates: {} });
  const measure = text => [...text].length * 10;
  const wrapped = lines('Start campaign', 50, measure);
  assert.ok(wrapped.length > 1, 'it wraps without spaces');
  assert.equal(wrapped.join(''), '开始战役，从血液到大脑');
  assert.ok(wrapped.every(line => !line.startsWith('，')), 'punctuation stays with the character before it');
  useLocale('en', null);
  assert.deepEqual(lines('one two three', 70, measure), ['one two', 'three']);
});

test('the language list and the browser default', () => {
  assert.deepEqual(LANGUAGES.map(item => item.id), ['en', 'es', 'de', 'fr', 'zh', 'hi']);
  assert.equal(preferredLanguage(['de-AT', 'en-US']), 'de');
  assert.equal(preferredLanguage(['zh-CN']), 'zh');
  assert.equal(preferredLanguage(['ja-JP']), 'en');
});

test('every shipped locale covers the catalog with matching slots', () => {
  const catalog = JSON.parse(readFileSync(new URL('../dist/locales/catalog.json', import.meta.url)));
  const slots = text => [...text.matchAll(/\{(\d+)\}/g)].map(match => match[1]).sort().join(',');
  for (const { id } of LANGUAGES.filter(item => item.id !== 'en')) {
    let data;
    try { data = JSON.parse(readFileSync(new URL('../dist/locales/' + id + '.json', import.meta.url))); } catch { continue; }
    for (const section of ['strings', 'templates']) {
      for (const english of Object.keys(catalog[section])) {
        const value = data[section]?.[english];
        assert.ok(typeof value === 'string' && value.trim(), `${id} translates ${english}`);
        assert.equal(slots(value), slots(english), `${id} keeps the slots of ${english}`);
      }
    }
  }
});

test('the game server serves the translation files', async () => {
  const { createServer } = await import('node:http');
  const { serveStatic } = await import('./static.mjs');
  const root = new URL('../dist/', import.meta.url).pathname;
  const server = createServer((request, response) => serveStatic(request, response, root, new URL(request.url, 'http://local')));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/locales/de.json`);
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), /application\/json/);
    assert.ok((await response.json()).strings['Start campaign']);
  } finally {
    server.close();
  }
});

test('a capitalised label run into a sentence, and verbatim text', async () => {
  const { verbatim } = await import('../dist/i18n.mjs');
  useLocale('es', { strings: { ASSAULT: 'ASALTO', 'Accurate automatic fire.': 'Fuego automático preciso.', Equipped: 'Equipado', IMMUNE: 'INMUNE' }, templates: {} });
  assert.equal(translate('ASSAULT Accurate automatic fire.'), 'ASALTO Fuego automático preciso.');
  assert.equal(translate('ASSAULT Accurate automatic fire. Equipped'), 'ASALTO Fuego automático preciso. Equipado');
  assert.equal(translate(verbatim('IMMUNE')), verbatim('IMMUNE'));
  useLocale('en', null);
});
