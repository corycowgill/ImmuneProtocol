// Operator profiles on the title screen: the operator chip in the header, the Operators screen
// (switch, create, rename, emblem, delete) and the "Who's deploying?" prompt at startup when more
// than one operator shares this browser. The storage rules are in profiles.mjs; settings-store.mjs
// points every progress key at the active profile. Switching dispatches `immune-protocol:profile`,
// and game.mjs, the achievement tracker and the difficulty picker re-read their saves in place.
import { profiles } from './settings-store.mjs';
import { MAX_PROFILES, PROFILE_COLORS, PROFILE_EMBLEMS, PROFILE_NAME_LENGTH, cleanProfileName } from './profiles.mjs';
import { achievements } from './achievement-system.mjs';
import { ACHIEVEMENT_BY_ID, rewardFor } from './achievements.mjs';
import { session } from './session.mjs';
import { byId, setText } from './dom.mjs';
import { gameUi } from './ui-browser.mjs';
import { LANGUAGES, LANGUAGE_EVENT, language } from './i18n.mjs';
import { askLanguage, chooseLanguage } from './language.mjs';

const dialog = byId('profiles-dialog');
const list = byId('profiles-list');
const emblems = byId('profile-emblems');
const nameField = byId('profile-name');
const nameNote = byId('profile-name-note');
const newButton = byId('profile-new');
const deleteButton = byId('profile-delete');
const deleteDialog = byId('profile-delete-dialog');
const done = byId('profile-done');
const languagePicker = byId('profile-language');
// Each language is listed in its own name. A word joiner in front keeps the interface from
// translating the names themselves.
languagePicker.replaceChildren(...LANGUAGES.map(({ id, name, english }) => {
  const option = document.createElement('option');
  option.value = id;
  option.textContent = '\u2060' + name + (name === english ? '' : ' · ' + english);
  return option;
}));
languagePicker.addEventListener('change', () => chooseLanguage(languagePicker.value));
// Switching operator loads their language a moment later; show it once it is in.
addEventListener(LANGUAGE_EVENT, () => { if (dialog.open) render(); });

export const PROFILE_EVENT = 'immune-protocol:profile';

export const emblemSrc = id => PROFILE_EMBLEMS.find(emblem => emblem.id === id)?.src ?? PROFILE_EMBLEMS[0].src;
export const profileColor = profile => PROFILE_COLORS[profile?.color ?? 0] ?? PROFILE_COLORS[0];

const lastPlayed = at => {
  if (!at) return 'Not deployed yet';
  try { return 'Last deployed ' + new Date(at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); } catch { return ''; }
};

// What ui-bindings shows for a profile card and the header chip.
export function profileCardData(profile) {
  const s = profiles.summary(profile.id);
  return {
    name: profile.name, src: emblemSrc(profile.emblem), color: profileColor(profile), active: profile.id === profiles.active?.id,
    stats: [s.secured + '/' + s.missions + ' missions', s.achievements + '/' + s.totalAchievements + ' achievements', s.points + ' G'],
    detail: (s.best ? 'Best ' + s.best.toLocaleString() + ' · ' : '') + lastPlayed(profile.lastPlayed),
  };
}

function render() {
  const active = profiles.active;
  setText(byId('profile-chip-name'), active?.name ?? 'Operator');
  byId('profile-open').setAttribute('aria-label', 'Operator: ' + (active?.name ?? '') + '. Switch or manage operators');
  list.replaceChildren(...profiles.profiles.map(profile => {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.profileId = profile.id;
    button.setAttribute('role', 'radio');
    button.setAttribute('aria-checked', String(profile.id === active?.id));
    const card = profileCardData(profile);
    const title = document.createElement('strong');
    title.textContent = profile.name;
    const detail = document.createElement('span');
    detail.textContent = card.stats.join(' · ') + '. ' + card.detail;
    button.append(title, detail);
    button.addEventListener('click', () => switchProfile(profile.id));
    return button;
  }));
  emblems.replaceChildren(...PROFILE_EMBLEMS.map(emblem => {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.emblem = emblem.id;
    button.setAttribute('role', 'radio');
    button.setAttribute('aria-checked', String(emblem.id === active?.emblem));
    const reward = rewardFor('emblem', emblem.id), lockedEmblem = reward && !achievements.hasReward('emblem', emblem.id) && emblem.id !== active?.emblem;
    button.disabled = !!lockedEmblem;
    button.setAttribute('aria-label', emblem.name + ' emblem' + (lockedEmblem ? ', locked: earn ' + ACHIEVEMENT_BY_ID[reward.achievement].name : ''));
    if (lockedEmblem) button.title = 'Earn ' + ACHIEVEMENT_BY_ID[reward.achievement].name;
    const image = document.createElement('img');
    image.src = emblem.src;
    image.alt = '';
    const label = document.createElement('strong');
    label.textContent = emblem.name;
    button.append(image, label);
    button.addEventListener('click', () => { if (achievements.hasReward('emblem', emblem.id) && profiles.setEmblem(profiles.active.id, emblem.id)) render(); });
    return button;
  }));
  if (document.activeElement !== nameField) nameField.value = active?.name ?? '';
  languagePicker.value = language();
  newButton.disabled = !profiles.canCreate;
  setText(byId('profile-new-detail'), profiles.canCreate ? 'Start a fresh save on this device' : 'Up to ' + MAX_PROFILES + ' operators per device');
  deleteButton.hidden = profiles.profiles.length <= 1;
  setText(done, active && active.name.length <= 10 ? 'Continue as ' + active.name : 'Continue');
}

export function switchProfile(id) {
  if (session.running || id === profiles.active?.id) return render();
  // Unsaved counters belong to the operator being left.
  achievements.flush();
  if (!profiles.select(id)) return;
  dispatchEvent(new Event(PROFILE_EVENT));
  render();
}

export function openProfiles(mode = 'manage') {
  if (session.running) return;
  setText(byId('profiles-title'), mode === 'choose' ? 'Who’s deploying?' : mode === 'setup' ? 'Set up your operator' : 'Operators');
  setText(byId('profiles-kicker'), mode === 'manage' ? 'Saves on this device' : 'Operators on this device');
  setText(nameNote, mode === 'setup' ? 'Pick a callsign and an emblem. Each operator on this device keeps their own campaign, loadout and achievements.' : '');
  render();
  dialog.showModal();
}

// After startup: a shared browser asks who is playing; a brand-new player first picks a language,
// then names their operator.
export function promptOperatorAtStartup(intro) {
  const mode = profiles.profiles.length > 1 ? 'choose' : profiles.fresh ? 'setup' : null;
  if (!mode) return;
  const open = () => mode === 'setup' ? askLanguage().then(() => openProfiles(mode)) : openProfiles(mode);
  if (intro?.open) intro.addEventListener('close', open, { once: true });
  else open();
}

nameField.maxLength = PROFILE_NAME_LENGTH;
nameField.addEventListener('input', () => {
  const name = cleanProfileName(nameField.value);
  if (!name) return setText(nameNote, 'A callsign needs at least one letter.');
  if (profiles.nameTaken(name, profiles.active.id)) return setText(nameNote, 'Another operator already uses that callsign.');
  profiles.rename(profiles.active.id, name);
  setText(nameNote, '');
  render();
});
nameField.addEventListener('blur', () => { nameField.value = profiles.active?.name ?? ''; setText(nameNote, ''); });

newButton.addEventListener('click', () => {
  const profile = profiles.create();
  if (!profile) return;
  achievements.flush();
  profiles.select(profile.id);
  dispatchEvent(new Event(PROFILE_EVENT));
  render();
  // A new operator picks their language first, then a callsign and an emblem.
  askLanguage().then(() => {
    render();
    setText(nameNote, 'New operator created with a fresh save. Give them a callsign and an emblem.');
    nameField.focus();
  });
});

deleteButton.addEventListener('click', () => {
  const active = profiles.active, s = profiles.summary(active.id);
  setText(byId('profile-delete-detail'), 'This removes ' + active.name + '’s campaign progress (' + s.secured + ' of ' + s.missions +
    ' missions), loadout, best score and ' + s.achievements + ' achievements from this browser. It cannot be undone.');
  deleteDialog.showModal();
});

byId('confirm-profile-delete').addEventListener('click', () => {
  achievements.flush();
  if (profiles.remove(profiles.active.id)) dispatchEvent(new Event(PROFILE_EVENT));
  deleteDialog.close();
  render();
});

gameUi.setProfileModel({
  chip: () => profiles.active && { ...profileCardData(profiles.active), profileId: profiles.active.id },
  card: id => profiles.find(id) && profileCardData(profiles.find(id)),
});
// Backups: one operator's save as a JSON file, restored as a new operator on any device.
byId('profile-export').addEventListener('click', () => {
  achievements.flush();
  const backup = profiles.exportProfile(profiles.active.id);
  if (!backup) return;
  const slug = backup.operator.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'operator';
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' }));
  link.download = 'immune-protocol-' + slug + '-' + backup.exported.slice(0, 10) + '.json';
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(link.href), 10000);
  setText(nameNote, 'Backup of ' + backup.operator.name + ' downloaded. Use Restore from backup to load it on this or another device.');
});

const importFile = byId('profile-import-file');
byId('profile-import').addEventListener('click', () => {
  if (!profiles.canCreate) return setText(nameNote, 'This device already has ' + MAX_PROFILES + ' operators. Delete one to restore a backup.');
  importFile.value = '';
  importFile.click();
});
importFile.addEventListener('change', async () => {
  const file = importFile.files?.[0];
  if (!file) return;
  let data = null;
  try { data = file.size <= 2_000_000 ? JSON.parse(await file.text()) : null; } catch { data = null; }
  const result = profiles.importProfile(data);
  if (result.error) { setText(nameNote, result.error); render(); return; }
  achievements.flush();
  profiles.select(result.profile.id);
  dispatchEvent(new Event(PROFILE_EVENT));
  render();
  setText(nameNote, 'Restored ' + result.profile.name + ' from the backup and switched to them.');
});

done.addEventListener('click', () => dialog.close());
byId('profile-open').addEventListener('click', () => openProfiles());
dialog.addEventListener('close', () => setText(nameNote, ''));
render();
