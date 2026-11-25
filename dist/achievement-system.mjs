// Browser wiring for achievements: the saved record in localStorage, the unlock pop-up and its
// chime, the main menu line, and the Achievements screen. The rules live in achievements.mjs and
// the presentation models in achievement-ui.mjs.
import { AchievementTracker, ACHIEVEMENT_STORAGE_KEY, rewardsOf } from './achievements.mjs';
import { AchievementToasts, achievementMenuDetail, achievementScreenModel } from './achievement-ui.mjs';
import { readSetting, writeSetting } from './settings-store.mjs';
import { gameUi } from './ui-browser.mjs';
import { session } from './session.mjs';
import { byId, setText } from './dom.mjs';

export const achievements = new AchievementTracker({
  load: () => readSetting(ACHIEVEMENT_STORAGE_KEY),
  save: text => writeSetting(ACHIEVEMENT_STORAGE_KEY, text),
});
export const achievementToasts = new AchievementToasts();

const dialog = byId('achievements-dialog');
const menuDetail = byId('achievements-menu-detail');

export function refreshAchievementMenu() {
  setText(menuDetail, achievementMenuDetail(achievements));
}

// Screen readers hear each unlock; the canvas banner is invisible to them.
const live = document.createElement('p');
live.id = 'achievement-live';
live.setAttribute('role', 'status');
live.setAttribute('aria-live', 'polite');
Object.assign(live.style, { position: 'fixed', width: '1px', height: '1px', overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap' });
document.body.append(live);

// The pop-up waits (up to a second and a half) for its art, so it never opens on an empty frame.
// Pop-ups still appear in the order they were earned.
const waiting = [];
function release() {
  while (waiting.length && waiting[0].ready) achievementToasts.push(waiting.shift().item);
}
function showToast(item) {
  const entry = { item, ready: false };
  waiting.push(entry);
  const ready = () => { entry.ready = true; release(); };
  let image = null;
  try { image = gameUi.active ? gameUi.resource(item.art) : null; } catch { image = null; }
  if (!image || (image.complete && image.naturalWidth)) return ready();
  image.addEventListener('load', ready, { once: true });
  image.addEventListener('error', ready, { once: true });
  setTimeout(ready, 1500);
}

achievements.onUnlock(item => {
  showToast(item);
  const rewards = rewardsOf(item.id).map(reward => reward.name);
  live.textContent = 'Achievement unlocked: ' + item.name + '. ' + item.description + ' ' + item.points + ' points.' + (rewards.length ? ' Reward: ' + rewards.join(', ') + '.' : '');
  session.audio?.achievement?.(item.tier);
  session.haptics?.event?.({ type: 'achievement' });
  refreshAchievementMenu();
});

gameUi.setToastSource(now => achievementToasts.frame(now));
gameUi.setAchievementModel(() => achievementScreenModel(achievements));

export function openAchievements() {
  achievements.flush();
  dialog.showModal();
}

byId('achievements-open')?.addEventListener('click', openAchievements);
byId('pause-achievements')?.addEventListener('click', openAchievements);
// Counters are saved every few seconds during play rather than on every kill, and when the page
// is hidden or closed.
setInterval(() => achievements.flush(), 4000);
document.addEventListener('visibilitychange', () => { if (document.hidden) achievements.flush(); });
addEventListener('pagehide', () => achievements.flush());
refreshAchievementMenu();

// Local development only: inspect or exercise the system from the console.
if (/^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname)) window.__achievements = { achievements, achievementToasts, openAchievements };
