# Loading and rendering review — 2026-11-20

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

GLB index accessor counts show about 14,000–24,000 triangles per ordinary pathogen, 109,942 for the colony, about 49,000 per suit, 88,970 for the carbine and 70,954 for the sniper. Compression reduces downloads, not the triangle count sent to the GPU. All-arena preparation trades startup time and retained memory for fewer first-use stalls. Dense waves, blended smoke and high resolution can still be expensive; these changes do not claim to eliminate every frame drop.

## Verification

`npm run check`, `npm run test:coop`, and `npm run test:render` cover syntax, 17 co-op/model tests, and three reuse/reset/saturation regressions. The resource tests execute 80 explosion/rocket cycles and ensure stable scene size and exact pool restoration, plus independent membrane material reuse across pathogen spawns.

Run `npm run verify:loading` for the reproducible browser fixture. It prepares all ten arenas, cycles every weapon, exercises the boss and repeated explosions, asserts the live simulation clock stays at zero during preparation, and reports late asset requests. Its CPU timing measures JavaScript/render submission, not GPU execution time. Frame rate is a short synthetic sample, not a minimum guarantee for real gameplay. Keep other game tabs paused when comparing runs.

The implementation follows the Three.js renderer APIs for [shader preparation and texture upload](https://threejs.org/docs/pages/WebGLRenderer). `compileAsync` prepares shader programs, while `initTexture` avoids first-render decode/upload work; actual rendering also initializes geometry buffers and render targets.

## Loading artwork

Asset: `dist/assets/loading-patrol.webp`, generated with the built-in imagegen tool and encoded as a 166 KB WebP. The original generated PNG is outside the repository; the game uses the checked-in WebP.

Final prompt: "Use case: stylized-concept. Asset type: widescreen video game loading screen background illustration, 1536x1024 or landscape. For Immune Protocol, a tactical science-fiction game about nano soldiers defending the human body from microbes. A tiny armored olive-green nano soldier with a brass rounded helmet and amber visor, carrying a futuristic carbine, stands on a red blood cell like a small ship, looking into a vast luminous artery with drifting red blood cells and a few distant purple microbes. Beautiful cinematic painted game key art, tactile biological surfaces, rich burgundy shadows, warm amber rim light and turquoise bioluminescent specks. Composition: main soldier and detailed scene in the RIGHT two thirds; LEFT third dark maroon atmospheric negative space for UI text, lower quarter mostly dark for a progress bar. Adventurous, witty sci-fi tone, polished premium game artwork. No text, no logos, no typography, no watermarks."

## Local browser result

The final renderer fixture passed all ten arenas with zero asset requests after renderer preparation and no browser warnings/errors. At an 800 × 450 CSS canvas it observed about 60 FPS in each short sample. All-arena renderer preparation took 5.94 s; mission gates took 141–278 ms; render CPU p95 ranged from 9.6 to 14.9 ms. These measurements are specific to this machine and this synthetic fixture. The actual UI was also checked at desktop and 390 × 844 mobile sizes, through the co-op lab and through Neural Cortex deployment. The mission overlay was visible at 90% before gameplay, and the game canvas received focus after preparation. An earlier run of the same fixture observed 147–581 ms gates, illustrating run-to-run variation.

# Frame rate review — 2026-11-21

`npm run profile`, then open `/__profile` on the printed address. The page renders a crowded wave in each arena at a fixed resolution and reports CPU time for scene update and draw submission, draw calls, triangles and lights. `?areas=artery,colon`, `?enemies=30`, `?frames=90`, `?quality=low` and `?size=1280x720` change the run.

Findings from the first run (24 pathogens, 1280 × 720): scene update about 1 ms and draw submission 3–6 ms of CPU, and the simulation step under 0.05 ms with 40 pathogens. The frame is GPU-bound. A crowded artery frame drew 2.05 million triangles, 1.6 million of them static decor, and almost every surface is a clearcoat physical material lit by 9–13 point lights.

Changes:

- **Light loop.** The stock three.js shader evaluates the full reflectance model for every point light on every pixel, including lights that are switched off (muzzle flash, explosion pool, indicators) or out of range. `world.mjs` patches the shared shader chunk to skip lights whose contribution is exactly zero. No pixel changes.
- **Dynamic resolution** (`dist/render-scale.mjs`). Below 50 fps the canvas is drawn at a lower scale, down to 60% per axis, and restored after several seconds at 57 fps or more. If fewer pixels do not raise the frame rate (a 30 Hz display, a CPU limit) the scale is restored and adaptation backs off. Covered by `server/render-scale.test.mjs`.
- **Decor geometry.** Small or distant instanced decor uses coarser meshes: blood river cells 784 → 196 triangles, drifting cells 672 → 448, villus grass 180 → 84, tall villi 840 → 448, lymphocytes and ear cilia 396 → 176.

| Arena (no pathogens) | Triangles before | After |
| --- | ---: | ---: |
| Artery | 1,618,000 | about 1,120,000 |
| Small intestine | 1,218,000 | 867,000 |
| Colon | 1,098,000 | 887,000 |
| Lymph node | 785,000 | 657,000 |
| Inner ear | 597,000 | 501,000 |

These runs used a software rasterizer, so triangle and CPU numbers are real but GPU time was not measured. The light-loop and dynamic-resolution gains need a check on real hardware. Not done: lower-detail pathogen models at distance (16,000–24,000 morph-animated triangles each) and fewer arena lights, both of which would change assets or lighting.

## Scenery culling

`dist/decor-chunks.mjs` splits arena-wide instanced batches into floor patches with their own bounds, so three.js skips the patches outside the view: wall folds, floor growths and cilia, villi and villus grass, colon bacteria and cocci, lymphocytes, ear cilia. Blood river cells are dealt each frame into six stretches per river. Patches wholly beyond the distance where fog leaves under 1% of their colour are hidden too; with the current fog that is over 100 m, so it rarely triggers.

Triangles per frame with no pathogens, from the spawn point (`?enemies=0&yaw=…`):

| Arena | Before culling | Facing ahead | Turned 90° | Turned 180° |
| --- | ---: | ---: | ---: | ---: |
| Artery | 1,120,000 | 874,000 | 662,000 | 555,000 |
| Small intestine | 867,000 | 805,000 | 535,000 | 411,000 |
| Colon | 887,000 | 870,000 | 678,000 | 535,000 |
| Lymph node | 657,000 | 558,000 | 379,000 | 406,000 |

Draw calls stayed between 170 and 290. The drifting red cells near the player and the stomach, lung and brain decor are not split.

## Freezes from mid-mission shader compiles

A browser trace of the artery training showed 60 fps script frames interrupted by seven GPU-process stalls of 0.5–5.4 s. three.js compiles each material for an exact light count. During training two tissue nodes are hidden and their lights left the scene with them, so play began with 9 point lights after the loading screen had prepared 11, and every material recompiled as it first came into view.

`World.syncLights` now draws each point light through a stand-in that stays in the scene and goes dark when its owner is hidden, so the count is fixed per arena (9–13, unchanged). `/__hitches` (same server as `/__profile`) plays a scripted opening of a mission and lists shader programs linked after the loading screen; `?area=heart`, `?tutorial` and `?frames=300` change the run. Artery training linked 17 before the fix and 0 after; artery, junction, heart, lungs, stomach and brain without training all link 0.
