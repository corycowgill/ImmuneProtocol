# Rogue Bot — NMD-07 compromised medical drone

The Rogue Bot is a new enemy (`rogue-bot`), separate from the existing malignant Rogue Cell (`rogue`). A hijacked medical nanodrone hunts the human response team with a mini laser cannon. It never attacks tissue: its AI has no tissue objective, the laser accepts only living human suits, and the central damage entry point rejects tissue damage from this type.

## Gameplay and AI

At Medium it has 88 health, speed 3.4 m/s and a 240-point kill score. Its laser deals 16 authored suit damage before the game's existing wave/difficulty multipliers (6.4 actual suit integrity on Medium), with a 4–28 m firing range. Difficulty modifiers, critical hits, rockets, turret slowing, kill credit and mission cleanup use existing systems.

The mechanical AI profile uses sight, reaction time, hearing, fading memory, nearby drone observations, obstacle-aware routes, strafing, retreat, cover and evasion. With no suit observation it patrols arena waypoints instead of selecting tissue. Investigating a lost suit uses stale observations; it does not grant firing permission through cover. The ordinary attack-pressure director gates charging.

The cannon announces a fixed firing line for 0.95 seconds. The drone holds its origin and direction during this warning, then fires once, flashes for 0.16 seconds, recovers for 0.5 seconds and cools down for 2.2 seconds. A thin red line, brightening optics, a `LASER LOCK` marker for the threatened local suit and a synthesized charge cue communicate the warning. A separate synthesized discharge cue accompanies firing. If the committed victim goes down or the drone evades, its warning cancels. Sidestepping the committed line makes the shot miss. Solid obstacle footprints clip the visible and damaging beam; the first living suit intercepting it receives one hit. Other suits and tissue beyond the impact are unaffected.

`rogue-bot.mjs` owns the attack state machine and clipping; `tactical-ai.mjs` and `ai-profiles.mjs` supply the profile and patrol behavior. The existing co-op enemy snapshots carry the complete current laser telegraph and target ID, allowing remote clients and reconnects to display the same committed warning. Rendering uses the existing enemy view pool, one reusable beam geometry per world and isolated beam materials per pooled view; dead/inactive drones hide their beams, and discarded views dispose those materials.

## Mission integration

The bot replaces a small number of existing ranged enemies, preserving authored wave lengths and lane strings. It first appears in Arterial Junction Wave 3, also appears in Wave 5, and appears in Bronchial Fork Wave 2, Gastric Chamber Wave 2, Intestinal Bend Wave 3, Colonic Reservoir Wave 2, Lymph Node Wave 2, Inner Ear Wave 2 and Neural Cortex Wave 1. Training, Capillary Junction's scripted surges, the Heart Valve patrol and scripted boss broods keep their rosters. A bot can occupy Predator Pack's ranged-support slot while retaining its player-only AI.

The existing disease guide now includes its animated model, Cycles portrait, counterplay, live stats, fictional background and automatically derived habitats. Deployment briefings pick it up from those same habitats. The guide reports zero tissue damage. The Rogue Cell remains available with its existing latching behavior.

## Blender assets and memory

`tools/enemies/build_rogue_bot.py` builds a complete hard-surface model in Blender: medical-white pressure hull and service panels, engraved identification, medical cross, exposed titanium chassis, brass fasteners and cooling rings, four ducted stabilizers with modeled rotor blades, folded surgical instruments, red camera eyes, status beacon and a recoiling optical cannon. Procedural surface variation and bevel normals are baked into PBR maps. Subtle servo/thruster motions and a cannon recoil target use the same five morph-channel names and Idle clip contract as existing enemies; the body does not use organic squash/stretch in combat.

The runtime GLB is 1,945,788 bytes with 30,504 triangles and four embedded 1024-pixel maps: albedo, ORM, normal and emission. The build also writes `dist/assets/enemies/portraits/rogue-bot.webp`, plus an editable packed `.blend` scene and a larger Cycles render to `tools/enemies/work/rogue-bot` (or `ROGUE_BOT_OUTPUT`). The runtime needs no new dependency or online asset service. The Blender source is reproducible; no downloaded robot mesh is required.

The prior mobile-only memory policy also applies to this model: one asset job at a time and 512-pixel textures on mobile, while desktop keeps full maps and its original parallel preparation. The mobile harness observed 70 enemy template images, maximum dimension 512 and 67.19 MiB of RGBA source pixels after adding the bot. That is a source-size estimate, not measured process/GPU memory. It also confirmed one prepared startup arena, zero co-op-only startup requests, queue peak one, and successful deferred arena/suit/lab loading. Output is in `tools/performance/rogue-bot-mobile.txt`. Real iPhone hardware still needs direct playtesting.

## Validation

All 132 automated tests and syntax checks passed. Thirteen focused bot tests cover habitat/intel integration, player-only patrol/targeting, cover, range, full warning timing, one-shot damage, sidestepping, terrain clipping, co-op commitment and interception, attack pressure/cooldown, snapshot serialization, bounded pooled rendering, and PBR/geometry asset contracts. Existing species asset tests also verify its animation channels, Idle clip, portrait and gallery entry.

The real desktop game reached its main menu and displayed the bot in the disease guide, including its 3D model, Provoke animation, stats and eight habitats, with no captured console warnings/errors. `/__rogue-bot` on the local verification server exercised the actual simulation/controller/renderer: a committed warning was visible, and the sidestep action produced one shot, zero damage events, 100 suit integrity and unchanged tissue. `/__mobile?memory=low` passed with the additional asset and deferred co-op loading.

`tools/performance/rogue-bot-balance.txt` records a Medium smoke sweep of four trials per mission with each existing anchor/rover bot (80 total): 75 wins, with at least one win in every mission. These stochastic runs do not prove human balance; long solo and live co-op playtests remain useful, especially in Colonic Reservoir. `npm run test:rogue-bot` runs the focused suite; `npm run verify:loading` serves the combat and mobile harnesses.
