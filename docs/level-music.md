# Level music

Every campaign level has its own combat theme in `dist/assets/music/levels/<area>.mp3`.

| # | Level | Theme | Style |
| --- | --- | --- | --- |
| 1 | Arterial Junction | Arterial Rush | Cyberpunk synthwave, ~150 BPM, heartbeat sub-bass, neon arpeggio lead |
| 2 | Capillary Junction | Capillary Chase | Darksynth, ~155 BPM, glitchy arpeggios, saw bass |
| 3 | Heart Valve | Valve Breaker | Heroic cyberpunk electro, ~140 BPM, heartbeat kick, synth brass |
| 4 | Bronchial Fork | Exhale Protocol | Neon drum and bass, ~174 BPM, rolling breaks, risers |
| 5 | Gastric Chamber | Acid Surge | Acid techno, ~145 BPM, squelchy 303 bass |
| 6 | Intestinal Bend | Villi Runner | Industrial electro funk, ~130 BPM, wobble bass, breakbeats |
| 7 | Colonic Reservoir | Biofilm Breakdown | Cyberpunk dubstep, ~140 BPM, growling bass, half-time drops |
| 8 | Lymph Node | Macrophage March | Electro-industrial, ~138 BPM, marching drums, alarm stabs |
| 9 | Inner Ear | Resonance Overdrive | Cyberpunk trance, ~150 BPM, ringing plucks, sonic sweeps |
| 10 | Neural Cortex | Mega Virus | Final-boss darksynth, ~160 BPM, distorted bass, blast fills |

## Playback (`GameAudio` in `dist/audio.mjs`)

- `launch()` calls `audio.setLevel(area)`: the theme is fetched and decoded during the
  mission loading screen (waiting at most 4 s), and the previous level's theme is
  stopped and released, so only one decoded theme is held in memory.
- The theme replaces the shared combat cue (`immune-response.mp3`). It starts from its
  opening bar when combat first begins in the level and loops for later waves; between
  waves and in menus the calmer shared drift cue plays as before. Retrying a level
  restarts its theme. A missing or undecodable theme falls back to the shared cue.
- Music volume in Settings, mute and the briefing-video ducking all apply.

## Making the tracks

Generated with Stability AI's Stable Audio 3 Medium (`stabilityai/stable-audio-3-medium`)
through Hugging Face Inference Providers: two 125 s instrumental takes per level from a
per-level style prompt and a shared negative prompt (no vocals, no slow or quiet intro,
no fade out). The better take was chosen by CLAP text-audio similarity
(`laion/larger_clap_music_and_speech`) to its prompt and to "fast energetic cyberpunk
arcade action", plus energy and vocal checks. Each pick was then trimmed to start at
full energy on a beat, cut to whole bars ending before any fade-out, crossfaded at the
loop point for seamless looping, normalized to -18 LUFS, and encoded as 160 kbps MP3
with a gapless header (~2.4 MB, ~2 minutes each).
