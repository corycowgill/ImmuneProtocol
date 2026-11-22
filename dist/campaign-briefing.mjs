// Story briefing shown when a new campaign begins. The <video> lives in a nonvisual
// compatibility dialog; the canvas UI draws its frames (see ui-bindings snapshot).
// Resolves once the clip ends, is skipped, or cannot play, so the campaign always continues.
import { byId } from './dom.mjs';
import { session } from './session.mjs';

export function playCampaignBriefing() {
  const dialog = byId('campaign-briefing');
  const video = dialog?.querySelector('video');
  if (!video || dialog.open) return Promise.resolve();
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
    video.addEventListener('ended', finish);
    video.addEventListener('error', finish);
    dialog.addEventListener('close', finish);
    // Duck the menu music under the doctor's dialogue; restored on finish.
    audio.musicLevel = 0;
    audio.fadeMusic();
    video.muted = session.muted;
    video.currentTime = 0;
    dialog.showModal();
    // Called from the Begin campaign click, so sound is allowed; if the browser still
    // refuses playback, skip straight to deployment rather than stalling on a black frame.
    Promise.resolve(video.play()).catch(finish);
  });
}
