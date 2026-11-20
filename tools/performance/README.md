# Loading and rendering review â€” 2026-11-20

The previous startup already prepared arena geometry and some shaders. The remaining gaps were suit models loaded from first-use accessors, on-demand weapon part cards, cosmetic textures generated on selection, briefing/guide portraits loaded when their UI opened, and rocket/explosion render paths missing from warmup. Per-shot tracer buffers and per-puff materials were also allocated and disposed repeatedly. Explosion `clear()` detached objects without disposing or retaining their resources.

The new loader covers downloads, decoding, procedural construction, texture uploads, shader compilation and actual pre-rendered frames. The mission gate uses a separate fixture so it never advances or mutates the live solo simulation. GPU fences keep pending uploads/draws behind that gate. Required model failures stay behind a retry screen. The lab renderer and all suit-picker portraits also prepare before the title. Cosmetic effect pools and tracer buffers persist; pathogen rigs reuse independent membrane materials.

## Asset inventory

| Group | Files | Disk size (MiB) |
| --- | ---: | ---: |
| Enemies and portraits | 24 | 17.27 |
| Suits | 4 | 11.05 |
| Weapons and atlases | 10 | 7.54 |
| Baked lab | 4 | 0.70 |
| Music | 2 | 1.47 |
| Sound effects | 33 | 1.97 |

GLB index accessor counts show about 14,000â€“24,000 triangles per ordinary pathogen, 109,942 for the colony, about 49,000 per suit, 88,970 for the carbine and 70,954 for the sniper. Compression reduces downloads, not the triangle count sent to the GPU. All-arena preparation trades startup time and retained memory for fewer first-use stalls. Dense waves, blended smoke and high resolution can still be expensive; these changes do not claim to eliminate every frame drop.

## Verification

`npm run check`, `npm run test:coop`, and `npm run test:render` cover syntax, 17 co-op/model tests, and three reuse/reset/saturation regressions. The resource tests execute 80 explosion/rocket cycles and ensure stable scene size and exact pool restoration, plus independent membrane material reuse across pathogen spawns.

Run `npm run verify:loading` for the reproducible browser fixture. It prepares all ten arenas, cycles every weapon, exercises the boss and repeated explosions, asserts the live simulation clock stays at zero during preparation, and reports late asset requests. Its CPU timing measures JavaScript/render submission, not GPU execution time. Frame rate is a short synthetic sample, not a minimum guarantee for real gameplay. Keep other game tabs paused when comparing runs.

The implementation follows the Three.js renderer APIs for [shader preparation and texture upload](https://threejs.org/docs/pages/WebGLRenderer). `compileAsync` prepares shader programs, while `initTexture` avoids first-render decode/upload work; actual rendering also initializes geometry buffers and render targets.

## Loading artwork

Asset: `dist/assets/loading-patrol.webp`, generated with the built-in imagegen tool and encoded as a 166 KB WebP. The original generated PNG is outside the repository; the game uses the checked-in WebP.

Final prompt: "Use case: stylized-concept. Asset type: widescreen video game loading screen background illustration, 1536x1024 or landscape. For Immune Protocol, a tactical science-fiction game about nano soldiers defending the human body from microbes. A tiny armored olive-green nano soldier with a brass rounded helmet and amber visor, carrying a futuristic carbine, stands on a red blood cell like a small ship, looking into a vast luminous artery with drifting red blood cells and a few distant purple microbes. Beautiful cinematic painted game key art, tactile biological surfaces, rich burgundy shadows, warm amber rim light and turquoise bioluminescent specks. Composition: main soldier and detailed scene in the RIGHT two thirds; LEFT third dark maroon atmospheric negative space for UI text, lower quarter mostly dark for a progress bar. Adventurous, witty sci-fi tone, polished premium game artwork. No text, no logos, no typography, no watermarks."

## Local browser result

The final renderer fixture passed all ten arenas with zero asset requests after renderer preparation and no browser warnings/errors. At an 800 × 450 CSS canvas it observed about 60 FPS in each short sample. All-arena renderer preparation took 5.94 s; mission gates took 141–278 ms; render CPU p95 ranged from 9.6 to 14.9 ms. These measurements are specific to this machine and this synthetic fixture. The actual UI was also checked at desktop and 390 × 844 mobile sizes, through the co-op lab and through Neural Cortex deployment. The mission overlay was visible at 90% before gameplay, and the game canvas received focus after preparation. An earlier run of the same fixture observed 147–581 ms gates, illustrating run-to-run variation.
