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

## The model: TRELLIS.2, Make-It-Animatable, Kimodo

Everything is generated with Hugging Face models on the logged-in account (ZeroGPU Spaces through `gradio_client`), then built and checked in Blender 5. The scripts are in `tools/nanonaut/`. This is the second build: the first one skinned a 17k-triangle TRELLIS scan with heat weights on a hand-placed 22-bone skeleton, and it stretched and tore in motion.

1. **Concept** (`concept.py`): FLUX.1 Krea, a hostile red and yellow hazmat soldier with realistic proportions in an A-pose, with hard-surface gear (seed 2101).
2. **Mesh** (`generate.py`): Microsoft TRELLIS.2 at 1536³ resolution, 293k triangles with 4K PBR maps (`originals/nanonaut-trellis2-11.glb`): real fingers, a gas mask and crisp pouches.
3. **Clean mesh** (`prepare_mesh.py`): TRELLIS.2 surfaces are thin double-sided shells, with an outer skin and an inward-facing copy a millimetre below it, which broke every bake. The script keeps only faces a ray can see from outside, turns any that face inward, and welds the result. It then decimates to 60k triangles, keeping the hands and helmet denser, unwraps afresh, and bakes albedo, metal/roughness and a tangent normal map from the full-resolution scan onto 2K maps. `rig_input.glb` is the same mesh for the auto-rigger.
4. **Skeleton** (`autorig.py`): Make-It-Animatable (CVPR 2025, `jasongzy/Make-It-Animatable`) predicts a Mixamo-standard 52-bone skeleton with full fingers and learned blend weights for the mesh.
5. **Assembly and weights** (`build_nanonaut.py`):
   - The rig is fitted back onto the game mesh by a least-squares rotation, scale and offset (Kabsch). The auto-rigger tilts the mesh about 5°, and the fit is exact. Weights are then copied vertex for vertex.
   - Separate gear pieces (plates, pouches, holster, mask, boots: 331 of 509 pieces) are bound wholly to their dominant bone, so they move as solid objects.
   - The learned weights split hard between the thighs at the crotch and between arm and chest at the armpit, so the build blends the pelvis into the crotch, relaxes the weights over the trunk, armpits and shoulder blades, and keeps limb influence out of the centre of the torso.
   - Finally: four influences, normalized, nothing under 0.01.
6. **Motion** (`motion.py`, `retarget.py`):
   - Every clip is motion capture from NVIDIA's Kimodo (`hugging-apps/kimodo-motion`): locomotion, rifle aiming, low-ready, cover, reloading, dodges, the stagger and both deaths. Each take is chosen from several seeds by direction, and right-handedness for the rifle clips (left-handed takes of non-directional clips are mirrored).
   - Retargeting works from joint positions: each bone, fingers included, is turned so a frame built from mocap landmarks matches the same frame built from the rig at rest, so the two rest poses cancel exactly. Every pose is a pure rotation, so no bone scale can creep in.
   - Legs use IK to the mocap ankles. The support hand is held on the handguard by IK (position and orientation), and both hands close round the carbine.
   - Loops are cut at the best-matching gait cycle and played in place. Deaths are settled onto the floor.
7. **Export**: one skinned, meshopt-compressed GLB (`dist/assets/enemies/nanonaut.glb`, 3.2 MB, 54 joints) with 17 clips and a `weapon` bone (its origin in the right palm, +Y down the barrel, +Z up). `portrait.py` renders the Cycles guide portrait.

The order is `prepare_mesh.py`, `autorig.py` and `build_nanonaut.py` (`blender -b -P …`; set `GLTFPACK` to the gltfpack binary or the npm package's `cli.js`, and `CLIPS=Aim,Walk` to build a subset), then `portrait.py` on `work/nanonaut.blend`. `python tools/nanonaut/motion.py [clip ...]` regenerates motion. `tools/nanonaut/viewer.html` is a small GLB viewer with every clip, and `closeup.py` renders four views of any clip frame.

### Automated QA

`blender -b tools/nanonaut/work/nanonaut.blend -P tools/nanonaut/qa.py -- --render` checks the rig and exits non-zero on failure. It currently passes:

- **Weights:** 36,087 vertices, none over four bones, unnormalized, under 0.01 or unweighted.
- **Tears** (how much longer any edge gets than at rest): 3–6 cm in play clips. The worst are long fabric edges at the collar and shoulder blades, reviewed in renders. Extreme test poses (knee 120°, arms raised, elbows 130°, deep crouch, waist twist, lean back, head turn, stride, closed fists) reach at most 5.5 cm.
- **Volume change:** 1–6% in play clips.
- **Ground and grip:** boots stay within 3 cm of the floor. The support hand stays within 3 cm of the handguard in the clips that drive the arms in game (aim, low-ready, cover); the locomotion clips contribute only their legs.

### Co-op suits on the same rig

The co-op suits are built by the same scripts, selected with `CHARACTER=<suit>` (work in `tools/nanonaut/work/<suit>/`, output `dist/assets/suits/rigged/<suit>.glb`).

1. **A-pose picture** (`apose_concept.py`): FLUX.1 Kontext re-poses the suit's existing front render (`tools/trellis/renders/<suit>/B_front.jpg`) into a 45° A-pose, keeping its design. The prompt is short and direct, with guidance 4: longer prompts that list what to keep leave the pose unchanged.
2. **The rest of the Nanonaut pipeline:**
   - `generate.py` (with `NAME=<suit>`), then `prepare_mesh.py` (with `HEIGHT`).
   - `autorig.py` (with `POSE=A-pose`), then `build_nanonaut.py`.
   - The build adds two steps for suits: separate armour on a shoulder rides the collarbone, and the retargeter carries half of the mocap's collarbone motion (`CLAVICLE`).

What failed, and why the A-pose matters:
- **T-pose scans:** the ribs and armpits smear once the arms come down to a rifle. Re-posing the scanned mesh in Blender pinches the armpit, which is worse.
- **Arms hanging close to the body:** TRELLIS.2 fuses forearm to hip and upper arm to chest, giving 10–40 cm tears.

Fixes for the bulky suits, all in the build:
- **Shoulders:** the upper arm moves only the skin outboard of the shoulder joint. The skin on top of and inside the shoulder follows the collarbone, blending across a span the length of the upper arm. Otherwise a rifle hold drags a wide suit's collar along.
- **Diving boots:** `STIFF_BOOTS=1` keeps the Bathysphere's lead boots from bending at the toe.

Status, all four rigged:
- **Lifeline:** passes QA, with tears of 4–5 cm at most.
- **Wraith, Vanguard and Bathysphere:** each has one long edge over the tear limit (a shoulder blade, the front of Vanguard's left pauldron, the back of Bathysphere's left armpit) at 7–11 cm. Each is invisible in renders, and all three were accepted on visual review. Stretch is within limits in every clip and every extreme pose.

[`teammate.mjs`](../dist/teammate.mjs) wears a suit's rigged model when it has loaded, and the jointed one otherwise. It uses the Nanonaut's animation layers, driven by the player's state:
- the legs follow how the player really moves, and crouching or sliding plays the crouch clips;
- the upper body aims when the player aims or has just fired, and reloads at the player's own reload speed;
- a downed player falls and stays down until revived;
- the player's own customised rifle sits in the right hand, and the spine turns so it points where they look.

`/__suits` on the verification server shows every suit driven through walking, strafing, running, crouching, aiming and firing, reloading and being downed.

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
- the GLB contract (skin with fingers, 17 clips, weapon bone, PBR maps, meshopt compression, portrait).

The species contract in `enemies.test.mjs` has a humanoid branch. All 350 other tests still pass; the one failure, serving translation files on this Windows checkout, fails the same way before the change.

`/__nanonaut` on the verification server (`npm run verify:loading`) runs a three-soldier fireteam in a real arena with the real renderer, with buttons to aim at, shoot and kill the followed soldier (`?r=2.4` brings the camera close). There it opened fire on the suit, strafed, dropped to a knee, dodged, reloaded crouched, and died falling backward onto the vessel floor, with no console errors.
