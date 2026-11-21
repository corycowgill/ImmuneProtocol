// Settings and progress saved in the browser. Storage can be unavailable (private browsing,
// blocked site data), so reads fall back to defaults and writes fail quietly.

export const bestKey = 'immune-protocol.best-score';
export const muteKey = 'immune-protocol.muted';
export const junctionKey = 'immune-protocol.junction-unlocked';
export const heartKey = 'immune-protocol.heart-unlocked';
export const tutorialKey = 'immune-protocol.training-complete';
export const sensitivityKey = 'immune-protocol.look-sensitivity';
export const qualityKey = 'immune-protocol.graphics-quality';
export const checkpointKey = 'immune-protocol.campaign-checkpoint';
export const unlockedKey = 'immune-protocol.unlocked-mission';
export const practiceLoadoutKey = 'immune-protocol.practice-loadout';
export const weaponLoadoutKey = 'immune-protocol.weapon-loadout';
export const weaponModKey = 'immune-protocol.weapon-mod';
export const weaponFinishKey = 'immune-protocol.weapon-finish';
export const coopNameKey = 'immune-protocol.coop-name';
export const megaVirusKey = 'immune-protocol.mega-virus-reached';
export const musicVolumeKey = 'immune-protocol.music-volume';
export const effectsVolumeKey = 'immune-protocol.effects-volume';

export function readSetting(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}

export function writeSetting(key, value) {
  try { localStorage.setItem(key, value); } catch { /* Private browsing may block storage. */ }
}
