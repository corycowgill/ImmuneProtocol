// The operator's language: read from their profile at startup and whenever the operator changes,
// saved when they pick another. A new operator starts in the browser's language when the game
// speaks it. i18n.mjs does the translating.
import { LANGUAGE_KEY, normalizeLanguage, preferredLanguage, setLanguage, language } from './i18n.mjs';
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
