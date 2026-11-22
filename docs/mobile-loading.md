# Mobile asset loading and memory

Reported symptom: an iPhone 15 Pro fails while startup loads all assets. The previous path started model decodes in parallel, retained full-size decoded images, uploaded their textures, prepared all ten arenas, and created the co-op lab renderer and every suit before the main menu. This is a credible memory-pressure trigger, but the actual device's termination reason has not been captured.

WebKit's Simon Fraser described an approximately 1.5 GB soft WebContent limit in August 2024, with enforcement depending on other processes' memory pressure and lower limits on devices with less RAM. This is guidance, not a guaranteed current allocation for every iPhone/iOS combination. iOS can terminate a process through jetsam; WebGL/GPU resources also have their own costs and failure modes. A JavaScript heap reading or downloaded asset size does not measure the complete footprint. Sources: [WebKit explanation](https://bugs.webkit.org/show_bug.cgi?id=277848#c1), [Apple jetsam documentation](https://developer.apple.com/documentation/xcode/identifying-high-memory-use-with-jetsam-event-reports).

The GLBs' embedded images alone represent approximately 444 MiB of RGBA pixels, or 592 MiB of uncompressed GPU textures including mipmaps, before decoded CPU images, geometry, external weathering/lab textures, procedural surfaces, render targets and browser overhead. These are estimates from image dimensions, not measured process or GPU memory. Ordinary texture cost is approximately width × height × 4 × 4/3 bytes with mipmaps; reducing JPEG/WebP download size alone does not reduce that allocation. See [Three.js texture memory guidance](https://threejs.org/manual/pages/textures.html).

## Changes

- `asset-loading.mjs` chooses the budget before the first request. Only iPhone/iPad/iPod/Android user agents and iPad desktop mode use the constrained profile. Desktop RAM and touch input alone never enable it. `?memory=low` enables the same path for development checks only on localhost/loopback hosts; public desktop URLs ignore it. There is no pretend numeric RAM reading for iPhone.
- A shared queue bounds fetch/decode/resize work to one asset job on mobile. Desktop starts every request immediately, preserving its original parallel loading without a new job limit. A GLB can still decode its own material images internally; it must finish resizing before another queued asset starts. Failures release the queue slot.
- GLB material images and external texture images are capped at 512 pixels per axis while retaining aspect ratio. Small textures, typed pixel textures and compressed GPU textures are preserved. Shared image references switch together before the original ImageBitmap closes. HTML images use a small canvas to retain WebGL's flipY behavior; glTF ImageBitmaps retain their existing orientation. Desktop keeps original texture dimensions.
- Mobile prepares its initial arena, then prepares other arenas at the existing deployment gate. Suits, lab atlases, lab renderer and suit portraits load when Online Co-op opens. The full co-op catalog remains available. Lab preparation is cached after success.
- Mobile skips exhaustive startup weapon/cosmetic shader permutations and other weapons' generated part cards. Its existing armory cache fills on first use. The armory preview is 640 × 400 without multisampling; the main and lab renderers also avoid antialias buffers, and the lab caps device pixel ratio at one. Low graphics is the default when no preference exists. Saved preferences remain usable.
- Mobile's preparation error mentions graphics-memory limits as a possible cause instead of suggesting only a connection problem. A process killed by iOS cannot reliably run this handler. Desktop retains its original preparation flow, error text, renderer settings, armory size, texture dimensions and startup warmup.

## Validation on 2026-11-21

`npm test` passed 119 tests, including nine checks for device policy, texture sizing, queue ordering/failure recovery, shared-image lifetime, resize failure, typed texture exclusions and external-image orientation. Desktop regression checks cover Windows, macOS and Linux at 1–16 GB reported RAM, public URL parameters and touch input; twenty pending desktop asset tasks start immediately and a 4096-pixel texture keeps its original source. `npm run check` and the whitespace checks passed.

`tools/performance/mobile-loading.html`, served at `/__mobile?memory=low` by the local verification server, checks actual loaded model texture dimensions, asset queue peak, initial arena count, deferred asset requests, a later Bronchial Fork deployment and deferred suits/lab. Captured output is in `tools/performance/mobile-loading-results.txt`.

Observed in a desktop Chromium browser on Windows with the constrained profile:

| Check | Result |
| --- | --- |
| Initial arena preparation | 1 arena; approximately 1.8 seconds in this local sample |
| Enemy template images, including added guard maps | 66 distinct images; largest dimension 512; 63.19 MiB RGBA pixel equivalent |
| Co-op-only startup requests | 0 |
| Peak queued asset jobs | 1 |
| Deferred Bronchial Fork preparation and rendering | Passed |
| Deferred four suits and lab atlas images | 15 images; largest dimension 512; 15 MiB RGBA pixel equivalent |

The actual game reached its menu, rendered the armory, and deployed into Neural Cortex on the constrained path. On a local co-op server it subsequently prepared the lab, created a room, rendered the suit picker and changed suits successfully. Normal desktop startup also reached the menu. No warnings or errors were captured in these browser checks. These checks validate the chosen path on this desktop, not iOS memory pressure or an actual iPhone 15 Pro. The user's phone still needs a direct retest after deployment.

The model GLBs still transfer at their original download size and decode one model's original images before resizing. Offline smaller textures or GPU-compressed texture variants could further reduce that transient cost. Visited arena caches still accumulate during a long campaign; this patch removes the all-arena startup peak rather than adding scene-cache eviction. It does not raise Safari's memory limit or guarantee a particular total footprint.
