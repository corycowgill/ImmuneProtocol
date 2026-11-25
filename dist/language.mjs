// The operator's language: read from their profile at startup and whenever the operator changes,
// saved when they pick another. A new operator starts in the browser's language when the game
// speaks it. i18n.mjs does the translating.
import { LANGUAGES, LANGUAGE_KEY, normalizeLanguage, preferredLanguage, setLanguage, language, verbatim } from './i18n.mjs';
import { readSetting, writeSetting } from './settings-store.mjs';

const PROFILE_EVENT = 'immune-protocol:profile';

export function savedLanguage() {
  const saved = readSetting(LANGUAGE_KEY);
  return saved ? normalizeLanguage(saved) : preferredLanguage();
}

// Resolves once the operator's language is loaded (or has failed to load, leaving English).
export const languageReady = setLanguage(savedLanguage());

globalThis.addEventListener?.(PROFILE_EVENT, () => {
  const wanted = savedLanguage();
  if (wanted !== language()) setLanguage(wanted);
});

// Picks a language for the active operator.
export async function chooseLanguage(id) {
  const next = normalizeLanguage(id);
  writeSetting(LANGUAGE_KEY, next);
  return setLanguage(next);
}

// The language step: a dialog listing every language in its own script, the current one picked.
// Resolves once the player has chosen and that language is loaded. A first visit and a new
// operator both start here.
export function askLanguage() {
  const dialog = document.getElementById('language-dialog');
  const options = document.getElementById('language-options');
  const title = document.getElementById('language-title');
  // "Language" in every language, so the title reads before anything is chosen.
  title.textContent = verbatim(LANGUAGE_WORDS.join(' · '));
  return new Promise(resolve => {
    options.replaceChildren(...LANGUAGES.map(({ id, name, english }) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'button outline language-option';
      button.dataset.language = id;
      button.setAttribute('role', 'radio');
      button.setAttribute('aria-checked', String(id === language()));
      button.setAttribute('aria-label', name + (name === english ? '' : ' (' + english + ')'));
      const label = document.createElement('strong');
      label.textContent = verbatim(name);
      button.append(label);
      if (name !== english) {
        const detail = document.createElement('span');
        detail.textContent = verbatim(english);
        button.append(detail);
      }
      button.addEventListener('click', async () => {
        await chooseLanguage(id);
        dialog.close();
        resolve(id);
      });
      return button;
    }));
    dialog.addEventListener('cancel', event => event.preventDefault());
    dialog.showModal();
  });
}

const LANGUAGE_WORDS = ['Language', 'Idioma', 'Sprache', 'Langue', '语言', '語言', 'भाषा'];
