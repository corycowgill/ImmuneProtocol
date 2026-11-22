// The armory menu: opening and closing it, the idle sway and drag-to-rotate of the weapon on
// the bench, and equipping what is chosen on armory-screen.mjs's tabs. Changes are saved at once;
// game.mjs listens through `armoryEvents` (a changed loadout cancels a co-op ready).
import { RULES } from './simulation.mjs';
import { WEAPON_ACCENTS, WEAPON_FINISHES, WEAPON_TYPES, loadoutWithBuild, normalizeWeaponBuild, normalizeWeaponLoadout } from './weapon-mods.mjs';
import { COSMETIC_SLOTS, cosmeticArt } from './arsenal-ui.mjs';
import { createArmoryScreen } from './armory-screen.mjs';
import { session } from './session.mjs';
import { byId, reducedMotion, clamp, setText } from './dom.mjs';
import { weaponLoadoutKey, writeSetting } from './settings-store.mjs';

// What the rest of the game hears about armory changes; game.mjs fills it in.
export const armoryEvents = {
  changed() {},
};

const coopArmoryStatus = byId('coop-armory-status');
export const armoryOpen = byId('armory-open');
export const armoryDialog = byId('armory-dialog');
const armoryTitle = byId('armory-title');
const armoryContext = byId('armory-context');
const armoryDone = byId('armory-done');
const armoryReset = byId('armory-reset');
const armoryPreview = byId('armory-preview');

const armoryCosmetics = {
  finish: { name: 'Finish', options: WEAPON_FINISHES },
  accent: { name: 'Accent', options: WEAPON_ACCENTS },
  ...COSMETIC_SLOTS,
};

// The armory shows and edits whichever carried weapon is selected on its Weapons tab.
function editedLoadout() {
  return session.armoryScreen.edited();
}

function drawArmory() {
  const edited = editedLoadout();
  const preview = session.armoryArt.render(edited, armoryView);
  preview.setAttribute('role', 'img');
  preview.setAttribute('aria-label', WEAPON_TYPES[edited.weapon].name + ' in ' + WEAPON_FINISHES[edited.finish].name +
    ' with ' + WEAPON_ACCENTS[edited.accent].name + ' accents');
  if (armoryPreview.firstElementChild !== preview) armoryPreview.replaceChildren(preview);
  session.armoryScreen.draw();
}

export function setupArmory() {
  session.armoryScreen ??= createArmoryScreen({
    document, dialog: armoryDialog, art: session.armoryArt, cosmetics: armoryCosmetics, cosmeticArt,
    getLoadout: () => session.weaponLoadout, equip: equipWeaponLoadout, baseCapacity: () => RULES.magazine,
  });
}

function equipWeaponLoadout(loadout) {
  session.weaponLoadout = normalizeWeaponLoadout({ ...normalizeWeaponLoadout(loadout), slot: 'primary' });
  writeSetting(weaponLoadoutKey, JSON.stringify(session.weaponLoadout));
  armoryEvents.changed(session.weaponLoadout);
  drawArmory();
}

// The armory opens from the menus only: before deployment and between missions, never mid-mission.
export function openArmory() {
  if (!session.ready || session.running || armoryDialog.open) return;
  setText(armoryContext, 'Pick two weapons, fit parts at the bench, then finish them your way.');
  armoryDone.disabled = false;
  coopArmoryStatus.hidden = true;
  drawArmory();
  armoryDialog.showModal();
  if (!armorySpin) armorySpin = requestAnimationFrame(spinArmory);
  armoryDialog.scrollTop = 0;
  armoryTitle.focus({ preventScroll: true });
}

// The armory preview turns slowly on its own; drag it to turn the weapon by hand.
const armoryView = { yaw: 0, pitch: 0 };

let armorySpin = 0;

let armorySpinAt = 0;

let armoryDrag = null;

let armoryRest = 0;

let armorySway = 0;

function spinArmory(now) {
  if (!armoryDialog.open) {
    armorySpin = 0;
    armorySpinAt = 0;
    return;
  }
  armorySpin = requestAnimationFrame(spinArmory);
  // About 25 frames a second keeps the full-size preview's readback cheap.
  if (now - armorySpinAt < 40) return;
  const dt = armorySpinAt ? Math.min(.1, (now - armorySpinAt) / 1000) : 0;
  armorySpinAt = now;
  if (armoryDrag || reducedMotion || !dt) return;
  // The weapon idles with a slow sway around wherever it was last turned to.
  armorySway += dt;
  armoryView.yaw = armoryRest + Math.sin(armorySway * .55) * .2;
  session.armoryArt.render(editedLoadout(), armoryView);
  session.armoryScreen.drawLeaders();
}

armoryPreview.addEventListener('pointerdown', event => {
  armoryDrag = { x: event.clientX, y: event.clientY };
  if (event.isTrusted) armoryPreview.setPointerCapture(event.pointerId);
});

armoryPreview.addEventListener('pointermove', event => {
  if (!armoryDrag) return;
  armoryView.yaw -= (event.clientX - armoryDrag.x) * .01;
  armoryView.pitch = clamp(armoryView.pitch + (event.clientY - armoryDrag.y) * .006, -.45, .6);
  armoryDrag = { x: event.clientX, y: event.clientY };
  session.armoryArt.render(editedLoadout(), armoryView);
  session.armoryScreen.drawLeaders();
});

for (const type of ['pointerup', 'pointercancel']) {
  armoryPreview.addEventListener(type, () => {
    // Idle sway resumes around the angle the weapon was left at.
    armoryRest = armoryView.yaw;
    armorySway = 0;
    armoryDrag = null;
  });
}

window.addEventListener('resize', () => { if (armoryDialog.open) session.armoryScreen.drawLeaders(); });

function closeArmory() {
  armoryDialog.close();
}

armoryOpen.addEventListener('click', () => openArmory());

byId('result-armory').addEventListener('click', () => openArmory());

armoryDone.addEventListener('click', closeArmory);

armoryDialog.addEventListener('cancel', event => {
  event.preventDefault();
  closeArmory();
});

armoryReset.addEventListener('click', () => {
  equipWeaponLoadout(loadoutWithBuild(session.weaponLoadout, editedLoadout().weapon, normalizeWeaponBuild({})));
});
