# Nanonaut — the enemy soldier

The Nanonaut (`nanonaut`) is a human operator in a red and yellow biosuit who has been shrunk and injected alongside the nanobots and fights for them with a carbine. It is the game's first human enemy. It fights like a soldier, not a pathogen: from cover, in short bursts, on the move, in fireteams. Like the Rogue Bot it hunts suits and never attacks tissue.

## Gameplay and AI

At Medium it has 120 health, runs at 4.4 m/s, walks aimed at 1.6 m/s and scores 280. Each carbine round that lands deals 14 authored suit damage before the game's wave and difficulty multipliers. Its hitbox is a body capsule and a head sphere (`humanoidHit` in [`nanonaut.mjs`](../dist/nanonaut.mjs)): a head shot is critical, a shot over the helmet misses, and it is shorter when crouched behind cover. It can come as an armoured elite, like the drones.

Its tactics run on the shared controller ([`tactical-ai.mjs`](../dist/tactical-ai.mjs), profile `soldier` in [`ai-profiles.mjs`](../dist/ai-profiles.mjs)) for sight, hearing, memory, squad sharing and routes, with a soldier's layer on top (`stepNanonaut`). Its state is plain data on `enemy.soldier`, so co-op snapshots carry it:

- **Patrol and search.** With no suit in sight it walks the controller's patrol, sweeping its gaze left and right. A suit it has lost it goes to look for, rifle up.
- **Cover and peeks.** It looks for an obstacle within 17 m that hides it from the suit and has a peek point beside it that sees the suit, preferring spots in its fighting band (9–24 m) and spots no squadmate already holds. It runs there, crouches out of sight for 0.9–2.1 s, steps out to the peek point and fires for 1.4–2.6 s, then ducks back. It holds its angle on where the suit was last seen. If the suit flanks it so the cover no longer hides it, it moves.
- **Fire.** Bursts of three to six rounds a tenth of a second apart, with a pause between bursts. It needs a clear line of fire (obstacle footprints, low scenery and the artery's vessels, in 3D) and one of the encounter director's attack slots, so a squad takes turns rather than firing all at once. Its first shot comes 0.38 s after it acquires a suit. Accuracy rises the longer it holds its aim, falls with range, when either side is moving, when the suit dashes, slides or crouches, and when it is being shot at. Misses fly past the suit and strike what is behind it; a round that meets cover stops there.
- **In the open** it strafes side to side while it fires, and now and then drops to a knee for a steadier burst. It backs off from a suit closer than 5 m and advances on one beyond its band.
- **Dodges.** When a suit lines its view up on it (its own `aimedAt` check), it may dive sideways (evasion 0.45, then 2.4 s before it can again).
- **Reloads.** A 26-round magazine, reloaded in 2.2 s, crouched, in cover when it has some. It cannot fire while reloading.
- **Suppression.** Being hit sends it into cover and spoils its aim for 1.6 s.
- **Push.** A suit below 35 health with the squad around it is pushed: it advances firing.

One shared AI bug was found and left alone: `EnemyAIController.perceive` computes the bearing for crosshair evasion as `atan2(-dx, -dz)`, but the suit's view runs along `(-sin yaw, -cos yaw)`, so the other evasive species dodge when a suit looks directly away from them. Fixing it changes their balance (the Rogue Bot tests depend on it), so the Nanonaut uses its own check and the shared code is unchanged.

## Missions

It fights in every area. One Spitting Spore becomes a Nanonaut in each wave from the second wave of every organ mission on, and in Arterial Junction waves 2–5, keeping each wave's length and lanes (each authored slot is fielded five times over, so this is a fireteam of five). The Heart Valve's flank patrols bring one, and the Capillary Junction's Breach brings a "Nanonaut fireteam" surge. Mission code `n` in [`organs.mjs`](../dist/organs.mjs). It can fill a Predator Pack's ranged slot.

## The model: TRELLIS, Blender, Kimodo

Everything is generated with Hugging Face models on the logged-in account, then built and checked in Blender. The scripts are in `tools/nanonaut/`.

1. **Concept** (`concept.py`): FLUX.1 Krea on its ZeroGPU Space, a hostile red and yellow hazmat soldier in an A-pose (arms clear of the body, so the mesh can be rigged).
2. **Mesh** (`generate.py`): TRELLIS image-to-3D on its ZeroGPU Space, 16.8k triangles with a 2K texture. The source is `tools/nanonaut/originals/nanonaut-7.glb`.
3. **Clean mesh and maps** (`build_nanonaut.py`): TRELLIS meshes are triangle soup with no joint topology, and the first build, skinned directly, tore and stretched. The build voxel-remeshes the scan into a watertight mesh, decimates it to 26k triangles and unwraps it afresh, then bakes the scan's colour onto it and a normal map from the scan's surface plus fabric folds and paint-chip relief. Roughness/metallic come from material classes (red and yellow paint, black rubber, bare metal, the visor), occlusion from Cycles, and the visor glows through an emission map.
4. **Skeleton and weights**: 22 deform bones placed at the scan's measured joints, then re-centred in each limb's cross-section. Heat-diffusion weights are faded softly to each bone's own region, so a leg cannot reach a waist pouch, and gear is bound rigidly to one bone (helmet to head, pack to chest, gloves to hands, boots to feet). Then smoothing, four influences, normalized, nothing under 0.01. The IK pole angles are calibrated numerically so solved limbs match the rest pose without twist.
5. **Motion** (`motion.py`, `retarget.py`): locomotion, dodges, the stagger and both deaths are motion capture from NVIDIA's Kimodo (`nvidia/Kimodo-SOMA-RP-v1.2`, trained on 700 hours of optical mocap) on the `hugging-apps/kimodo-motion` ZeroGPU Space. Directional takes are chosen from six seeds by how closely they travel the intended way without turning. Retargeting works from joint positions: each bone is turned so a frame built from mocap landmarks (bone direction plus a twist reference: hip, shoulder or eye line) matches the same frame built from the rig at rest, so the two skeletons' different rest poses cancel exactly. Legs use IK to the mocap ankles, scaled to the rig's leg length and raised to its ankle height. Loops are cut at the best-matching gait cycle, and locomotion is in place. The aiming, low-ready, cover and reload poses are keyframed with IK hands on the carbine. Everything is baked to plain bone rotations, and deaths are settled onto the floor.
6. **Export**: one skinned GLB (`dist/assets/enemies/nanonaut.glb`, 3.3 MB) with 17 clips and a `weapon` bone (its +Y down the barrel, +Z up), plus the Cycles guide portrait.

`blender -b -P tools/nanonaut/build_nanonaut.py -- [--skip-bake] [--preview] [--portrait]` rebuilds it, and `python tools/nanonaut/motion.py [clip ...]` regenerates motion. `tools/nanonaut/viewer.html` is a small GLB viewer with every clip, and `gallery.py` writes a review page of the preview renders.

### Automated QA

`blender -b tools/nanonaut/work/nanonaut.blend -P tools/nanonaut/qa.py -- --render` checks the rig and exits non-zero on failure. It currently passes:

- **Weights:** 12,998 vertices, none over four bones, unnormalized, under 0.01 or unweighted. 443 (3.4%) blend bones that are not skeleton neighbours, mostly spine with upper arm at the armpit, under the 5% limit.
- **Tears:** the worst tear (how much longer any edge gets than at rest) is 2–5 cm in play clips and at most 5.9 cm in the extreme test poses: knee at 120°, arms raised, elbows at 130°, deep crouch, waist twist, lean back, head turn, stride.
- **Volume change:** 1–7% in play clips, up to 12% in the deepest folds (deaths, dives, kneeling).
- **Ground and grip:** boots stay within 3 cm of the floor, and hands stay on the carbine in every two-handed clip.

The limits were calibrated against the measured rig for linear blend skinning, which is what three.js uses.

## In the game

[`nanonaut-view.mjs`](../dist/nanonaut-view.mjs) clones the skinned template with its own skeleton and hangs a clone of the game's carbine (the arsenal model, at the teammates' scale) on the weapon bone. It animates in two layers. The legs blend standing, the four walking directions, running and crouching from the body's real velocity relative to its facing, at the playback speed that keeps the boots planted. The upper body blends aiming, low-ready, cover and reloading. Dodges, the stagger and deaths take over the whole body.

Each frame the spine and chest are turned so the barrel points exactly where the simulation aims, which lets the aiming pose ride any leg layer. Shots kick it back, and hits rock it away from the shooter. Its rounds draw orange-red tracers from the muzzle with a flash, and misses spark where they strike. The carbine uses the suits' own rifle samples, pitched down. Its death falls the way the killing shot pushed it, the suit vents and pools, and the body lies for six seconds before sinking. The disease guide shows it aiming on the turntable, and Provoke plays its reload.

## Validation

`npm run test:nanonaut` runs ten tests against the real simulation loop:

- player-only and present in all ten areas;
- bursts that hurt a suit in the open, with misses;
- no round through cover;
- runs to cover hidden from the suit, then peeks and fires;
- reloads when dry and cannot fire meanwhile;
- dodges sideways when aimed at;
- backs off a close suit;
- the humanoid hitbox (head critical, over-the-helmet miss, crouched shorter);
- co-op-safe state;
- the GLB contract (skin, 17 clips, weapon bone, PBR and emission maps, portrait).

The species contract in `enemies.test.mjs` has a humanoid branch. All 350 other tests still pass; the one failure, serving translation files on this Windows checkout, fails the same way before the change.

`/__nanonaut` on the verification server (`npm run verify:loading`) runs a three-soldier fireteam in a real arena with the real renderer, with buttons to aim at, shoot and kill the followed soldier. There it opened fire on the suit, strafed, dropped to a knee, dodged, reloaded crouched, and died falling backward onto the vessel floor, with no console errors.
