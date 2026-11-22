// Story briefings from the lab: the campaign opener and one per mission. The <video> lives in
// a nonvisual compatibility dialog; the canvas UI draws its frames (see ui-bindings snapshot).
// Each briefing resolves once the clip ends, is skipped, or cannot play, so play always continues.
import { byId } from './dom.mjs';
import { session } from './session.mjs';
import { briefingsSeenKey, readSetting, writeSetting } from './settings-store.mjs';

// Spoken lines, also exposed to assistive technology through the dialog's transcript.
export const BRIEFINGS = Object.freeze({
  campaign: 'Nanonauts, listen carefully. Two hours ago, the President slipped into a coma. A foreign power injected him with malicious viruses, powered by reprogrammed medical nanites. Machines meant to heal him, now turned against him. The only way to stop them is the same technology. We are going to shrink you, nanonauts, and send you in to battle the infection and heal the President. Good luck.',
  artery: 'Mission one: the arterial junction. The infection is entering through his bloodstream. Hold the core, the branch and the venous wall. And watch for the Thrombus Titan. Bait its charge into a wall.',
  junction: 'Mission two: the capillaries. They are splitting their attack across two inlets, so read the forecast and cover both. A Capillary Leech is draining his tissue. Shoot it off the node.',
  heart: 'Mission three: the heart itself. The valve opens and closes with every beat. Time your shots through it, and keep that outer wall standing. His heart cannot take much more.',
  lungs: 'Mission four: the lungs. When he exhales, get out of the center airway, or you will be blown right back. Reopen both bronchi and hold them for one full breath. And watch out for the Mold Crown.',
  stomach: 'Mission five: the stomach. When the acid rises, get up on the banks. It will eat right through your suit. Shut the intake, open the drain, and hit the Pylori Drill when it erupts.',
  intestines: 'Mission six: the intestines. It is a forest of villi down there. When a contraction sweeps the center, dive into a side channel. And yes, that is a tapeworm. Destroy the segments to expose the head.',
  colon: 'Mission seven: the colon. His microbiome is boiling over. The walls squeeze side to side, so watch the band and step aside. The Biofilm Colossus regrows. Keep firing, and back off the slam.',
  lymph: 'Mission eight: the lymph node. A macrophage is on patrol. It eats every pathogen it touches, and it will crush you too. Lure the infection into its path. And if it goes rogue, shoot it to break its pull.',
  ear: 'Mission nine: the inner ear. Resonance pulses will slow you down and jam your turrets, so set them up outside the rings. And when the Otolith Screamer charges up, get behind cover.',
  brain: "This is it. The neural cortex. The source of the infection is here: the Mega Virus. Protect the overloaded node, and end this. The President's life is in your hands, nanonauts.",
});

const source = key => key === 'campaign' ? 'assets/story/campaign-intro' : 'assets/story/missions/' + key;

export function briefingPlaying() {
  return !!byId('campaign-briefing')?.open;
}

function play(key) {
  const dialog = byId('campaign-briefing');
  const video = dialog?.querySelector('video');
  if (!video || dialog.open || !BRIEFINGS[key]) return Promise.resolve();
  return new Promise(resolve => {
    const audio = session.audio;
    const musicLevel = audio.musicLevel;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      video.pause();
      video.removeEventListener('ended', finish);
      video.removeEventListener('error', finish);
      dialog.removeEventListener('close', finish);
      if (dialog.open) dialog.close();
      audio.musicLevel = musicLevel;
      audio.fadeMusic();
      resolve();
    };
    const base = source(key);
    video.poster = base + '.webp';
    if (!video.src.endsWith(base + '.mp4')) video.src = base + '.mp4';
    byId('campaign-briefing-transcript').textContent = BRIEFINGS[key];
    dialog.setAttribute('aria-label', key === 'campaign' ? 'Campaign briefing from the lab' : 'Mission briefing from the lab');
    video.addEventListener('ended', finish);
    video.addEventListener('error', finish);
    dialog.addEventListener('close', finish);
    // Duck the menu music under the doctor's dialogue; restored on finish.
    audio.musicLevel = 0;
    audio.fadeMusic();
    video.muted = session.muted;
    video.currentTime = 0;
    dialog.showModal();
    // Started from a button press, so sound is allowed; if the browser still refuses
    // playback, continue rather than stall on a black frame.
    Promise.resolve(video.play()).catch(finish);
  });
}

export function playCampaignBriefing() {
  writeSetting(briefingsSeenKey, '[]');
  return play('campaign');
}

function seenMissions() {
  try {
    const seen = JSON.parse(readSetting(briefingsSeenKey) ?? '[]');
    return Array.isArray(seen) ? seen : [];
  } catch {
    return [];
  }
}

// Each mission's briefing plays the first time it is deployed in a campaign; retries,
// checkpoint restarts and a resumed campaign skip what was already shown.
export async function playMissionBriefing(area) {
  const seen = seenMissions();
  if (seen.includes(area) || !BRIEFINGS[area]) return;
  writeSetting(briefingsSeenKey, JSON.stringify([...seen, area]));
  await play(area);
}
