// How achievements are presented: the "achievement unlocked" pop-up queue and the plain screen
// model for the Achievements list. No DOM: the canvas renderer draws the toast and the screen,
// ui-bindings hands the model to ui-screens like any other dialog.
import { ACHIEVEMENTS, CATEGORIES, TIERS, PLATINUM_ID } from './achievements.mjs';

// Toast timeline in seconds: the art pops in, the banner unrolls from it, holds, then folds away.
export const TOAST_TIMING = Object.freeze({ pop: .32, unroll: .38, hold: 4.6, exit: .45 });
export const TOAST_DURATION = TOAST_TIMING.pop + TOAST_TIMING.unroll + TOAST_TIMING.hold + TOAST_TIMING.exit;
const GAP = .25;

const ease = t => 1 - (1 - t) ** 3;
const clamp01 = t => Math.max(0, Math.min(1, t));
// Overshoots past 1 then settles, for the pop.
const back = t => { const s = 2.2; return 1 + (s + 1) * (t - 1) ** 3 + s * (t - 1) ** 2; };

// One pop-up at a time, in the order they were earned. Times are in milliseconds (performance.now).
export class AchievementToasts {
  constructor() { this.queue = []; this.current = null; this.startedAt = 0; this.nextAt = 0; }
  push(item) { if (item) this.queue.push(item); }
  get active() { return !!this.current || this.queue.length > 0; }
  clear() { this.queue.length = 0; this.current = null; }

  // The toast to draw this frame, with its animation state, or null.
  frame(now) {
    if (this.current && (now - this.startedAt) / 1000 >= TOAST_DURATION) {
      this.current = null;
      this.nextAt = now + GAP * 1000;
    }
    if (!this.current && this.queue.length && now >= this.nextAt) {
      this.current = this.queue.shift();
      this.startedAt = now;
    }
    if (!this.current) return null;
    return toastState(this.current, (now - this.startedAt) / 1000, this.queue.length);
  }
}

// Animation channels for a toast `age` seconds old: art scale, banner width (0..1), text alpha,
// overall alpha and lift, and the shine sweep position.
export function toastState(item, age, waiting = 0) {
  const { pop, unroll, hold, exit } = TOAST_TIMING;
  const art = age < pop ? back(clamp01(age / pop)) : 1;
  const open = ease(clamp01((age - pop * .7) / unroll));
  const exitStart = pop + unroll + hold;
  const leaving = clamp01((age - exitStart) / exit);
  const text = clamp01((age - pop - unroll * .5) / .25) * (1 - leaving);
  const shine = clamp01((age - pop - unroll) / .9);
  return {
    item, age, waiting, art: Math.max(0, art) * (1 - leaving * .35), open: open * (1 - ease(leaving)),
    text, alpha: 1 - leaving, lift: ease(leaving) * 18, shine: shine > 0 && shine < 1 ? shine : null,
  };
}

const formatDate = at => {
  try { return new Date(at).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }); } catch { return ''; }
};

function card(tracker, item) {
  const unlocked = tracker.isUnlocked(item.id);
  const secret = item.hidden && !unlocked;
  const progress = tracker.progress(item.id);
  return {
    kind: 'achievement', id: '@achievement:' + item.id, action: '@achievement:' + item.id, height: 112,
    achievement: item.id, tier: item.tier, points: item.points, unlocked, secret,
    text: secret ? 'Hidden achievement' : item.name,
    detail: secret ? 'Keep playing to reveal this one.' : item.description,
    src: secret ? 'assets/achievements/hidden.webp' : item.art,
    progress: !unlocked && !secret && progress && progress.goal > 1 ? progress : null,
    date: unlocked ? formatDate(tracker.unlockedAt(item.id)) : '',
    // The accessibility mirror reads the label, then the detail (the description).
    label: (secret ? 'Hidden achievement' : item.name) + ', ' + TIERS[item.tier].name + ', ' + item.points + ' points, ' + (unlocked ? 'unlocked' : progress && progress.goal > 1 && !secret ? 'locked, ' + Math.min(progress.value, progress.goal) + ' of ' + progress.goal : 'locked'),
  };
}

// Locked achievements closest to done, for the summary's "next up" row.
function nearest(tracker, limit = 3) {
  return ACHIEVEMENTS.filter(item => !tracker.isUnlocked(item.id) && !item.hidden && item.goal > 1)
    .map(item => ({ item, ratio: tracker.progress(item.id).value / item.goal }))
    .filter(entry => entry.ratio > 0).sort((x, y) => y.ratio - x.ratio).slice(0, limit).map(entry => entry.item);
}

export function achievementScreenModel(tracker) {
  const summary = tracker.summary();
  const header = { kind: 'achievement-summary', height: 132, ...summary, platinum: tracker.isUnlocked(PLATINUM_ID),
    text: summary.earned + ' of ' + summary.total + ' achievements earned, ' + summary.points + ' of ' + summary.totalPoints + ' points' };
  const order = (x, y) => Number(tracker.isUnlocked(y.id)) - Number(tracker.isUnlocked(x.id)) || (tracker.unlockedAt(y.id) ?? 0) - (tracker.unlockedAt(x.id) ?? 0);
  const grid = items => ({ kind: 'grid', minColumn: 330, maxColumns: 3, children: items.map(item => card(tracker, item)) });
  const section = text => ({ kind: 'section', text });
  const recent = tracker.recent(3), next = nearest(tracker);
  const overview = [header,
    ...(recent.length ? [section('Recently earned'), grid(recent)] : []),
    ...(next.length ? [section('Closest to unlocking'), grid(next)] : []),
    section('All achievements'), grid([...ACHIEVEMENTS].sort(order)),
  ];
  const views = [{ id: 'all', text: 'Overview', body: overview }, ...CATEGORIES.map(category => {
    const items = ACHIEVEMENTS.filter(item => item.category === category.id);
    const earned = items.filter(item => tracker.isUnlocked(item.id)).length;
    return { id: category.id, text: category.name, body: [section(category.name + ' · ' + earned + ' of ' + items.length), grid(items)] };
  })];
  const details = Object.fromEntries(ACHIEVEMENTS.map(item => [item.id, detailNodes(tracker, item)]));
  return { views, details, summary };
}

// The pop-up shown when an achievement card is selected: large art and the full record.
export function detailNodes(tracker, item) {
  const unlocked = tracker.isUnlocked(item.id), secret = item.hidden && !unlocked, progress = tracker.progress(item.id);
  return [
    { kind: 'achievement-art', src: secret ? 'assets/achievements/hidden.webp' : item.art, tier: item.tier, unlocked, height: 300 },
    { kind: 'heading', text: secret ? 'Hidden achievement' : item.name, size: 30 },
    { kind: 'text', text: secret ? 'This achievement is hidden until you earn it. Keep playing.' : item.description, size: 15, color: '#c1cdd2' },
    { kind: 'grid', minColumn: 120, maxColumns: 3, children: [
      { kind: 'stat', text: 'Tier', detail: TIERS[item.tier].name },
      { kind: 'stat', text: 'Score', detail: item.points + ' G' },
      { kind: 'stat', text: 'Status', detail: unlocked ? 'Unlocked' : 'Locked' },
    ] },
    ...(unlocked ? [{ kind: 'text', text: 'Earned ' + formatDate(tracker.unlockedAt(item.id)), size: 13, color: TIERS[item.tier].color }] : []),
    ...(!unlocked && !secret && progress && progress.goal > 1 ? [{ kind: 'meter', text: 'PROGRESS', value: progress.value, max: progress.goal, detail: progress.value.toLocaleString() + ' / ' + progress.goal.toLocaleString(), color: TIERS[item.tier].color }] : []),
  ];
}

// The main menu line under "Achievements".
export function achievementMenuDetail(tracker) {
  const s = tracker.summary();
  return s.earned + ' of ' + s.total + ' earned · ' + s.points + ' / ' + s.totalPoints + ' G';
}
