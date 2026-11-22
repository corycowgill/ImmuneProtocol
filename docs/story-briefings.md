# Story briefings

The lead physician briefs the player from the lab in short videos (`dist/campaign-briefing.mjs`).

| When | Video |
| --- | --- |
| A new campaign begins (before the deployment screen) | `assets/story/campaign-intro.mp4` |
| A campaign mission is deployed for the first time in that campaign | `assets/story/missions/<area>.mp4` |

- Mission briefings play once per campaign. Retries, wave checkpoints and a resumed
  campaign skip briefings already shown (`immune-protocol.briefings-seen`); starting a
  new campaign clears the list. Free mode, boss practice and co-op never play them.
- Videos are drawn by the canvas UI (`intro` screen type) with a Skip briefing button;
  Escape or controller back also skips. Menu music is ducked, mute is respected, and a
  playback failure continues straight to the mission.
- Files load only when played (`preload="none"`). Each `.webp` beside a video is its poster.
- The spoken lines live in `BRIEFINGS` and fill the accessibility transcript.

Each mission video is a talking-doctor shot followed by that level's boss with a mission
title card. Keyframes were made with Qwen-Image-Edit-2511 (from a photo, and from the
game's boss portraits) and FLUX.1-dev; shots with dialogue and sound by LTX-2 via
Hugging Face Inference Providers; edited with ffmpeg (loudness -16 LUFS for dialogue).
