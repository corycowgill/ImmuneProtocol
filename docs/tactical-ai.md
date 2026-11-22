# Tactical pathogen AI

## Repository assessment

The static `dist/` directory is source, with vendored Three.js; there is no bundler or build step. `Simulation` owns movement, collision footprints, attacks, spawning, waves, scoring and objectives. `CoopSimulation` subclasses it on the authoritative Node server. `World` renders snapshots and existing morph animations. The twelve species use lunge, latch or spit attacks; the stationary Heart colony, Mega Virus, eight mission bosses, nests and segments have separate scripted controllers. Logical obstacles are static circles, and the arenas are ellipses (the Heart is a confined set piece). Existing steering only pushed enemies out of circles and selected suits by exact distance. Node's built-in test runner is the existing test infrastructure.

The integration keeps the existing attack state machines and all authored stats, difficulty scaling, waves and scripts. A small deterministic utility controller replaces ordinary enemy target/movement selection inside the one existing update loop. A reusable visibility graph fits the actual circle footprints without a NavMesh dependency. Separate modules hold configuration, navigation, simulation intelligence and an optional browser debug view. Special scripted enemies keep their existing controllers and contribute to encounter pressure rather than receiving competing controllers.

## Modules and update contract

`Simulation.reset()` owns an `AIWorld`; `advanceEnemies()` calls its `begin/end` around the single existing enemy loop. Controllers live in a map outside enemy snapshots. Only a five-field `tactical` summary goes over co-op. Deaths, including macrophage consumption, remove memory, routes, reservations and pressure leases immediately; reset disposes the old world. The tutorial breach deliberately keeps its authored controller.

| Module | Responsibility |
| --- | --- |
| `dist/ai-profiles.mjs` | Species mapping, immutable biological profiles, work budgets and tactical difficulty modifiers |
| `dist/ai-navigation.mjs` | Circular-footprint LOS, projected reachable goals and reusable visibility graph/A* |
| `dist/tactical-ai.mjs` | World/spatial hash, decaying memory, perception, utility/action execution, squad roles/reservations, director and telemetry |
| `dist/ai-debug.mjs` | Optional DOM/canvas debug map and decision explanations; no renderer dependency in intelligence |
| `dist/simulation.mjs` | Adapter to existing lunge/latch/spit state machines, windups, damage and collisions |

Movement runs at the simulation rate (normally 60 Hz solo; the server retains its own tick). Perception is 6.7 Hz, utility 3.1 Hz, squads 1.4 Hz and the director 2 Hz, staggered by stable entity IDs. Distant enemies use one third the perception frequency and half the decision frequency. Per frame the defaults allow 24 perception LOS tests and two path searches; each search is bounded by the static graph's waypoint count. Cached routes replan no more than once per 1.1 seconds per enemy, with stuck recovery and failure cooldowns. Immediate combat geometry checks remain independent of the perception budget so budget exhaustion never permits a shot through cover.

Vision uses range, field of view, obstacle footprints and distance-dependent reaction time. Close biological sensing broadens acquisition inside each profile's short range, still requiring attack LOS. The assigned static tissue node is an explicit spawn signal; other nodes must be sensed. Player positions and velocities are copied observations, not live memory references. Shots, explosions, impacts, tissue disturbances and ally deaths use a bounded event queue. Hearing produces an imprecise fixed location; alerts widen attention but cannot see through solids. Nearby compatible families share recent sighting copies at reduced confidence, without visibility or live tracking. Threats expire after six seconds; failures expire after eight seconds.

Utility actions have capability/precondition filters, weighted scores, a 0.65-second default commitment and 0.12 score hysteresis. Critical danger, target loss/destruction and severe damage interrupt commitment. Investigations complete at the remembered location, defensive actions time out and cool down, and failed paths trigger bounded retries. Health, archetype, observed threats, distance, allies, local cover, recent damage, cooldowns and squad roles affect decisions. Ranged aiming uses bounded observed velocity lead and seeded error. Existing attacks retain their damage, cooldowns, animations and telegraphs; release checks and projectile swept collision prevent wall penetration. Tissue projectiles retain their launch objective even if their owner later changes targets.

Nearby compatible enemies assign objective/aggressor/flanker/suppressor/defender roles; they reserve spaced destinations, share limited observations and reassign on deaths. Low-health defensive species seek terrain or allies. Armoured guards can stand between a vulnerable colony member and a visible threat, using their existing directional armour. Bacteria still tear tissue rather than gaining an invented suit attack. The director tracks composition, live suits/tissue, recent attack damage, deaths, pressure and event timing. It spaces attack starts and provides relief when suits or tissue are critical. Ordinary pressure limits are 3/4/5 on Easy/Medium/Hard (tissue limit three, reduced to one at critical tissue integrity). Scripted bosses reserve up to two additional pressure positions from that budget; their authored attack scripts remain independent. Existing health/damage difficulty scaling remains in `difficulty.mjs`.

## Species behavior

| Existing species | Profile and behavior |
| --- | --- |
| virus, phage; splitter fragments/nest larvae | Swarm hunter: surround/flank, split player/tissue pressure, investigate lost threats, occasional visible-threat evasion |
| splitter, flagellate | Fast harasser: aggressive flanks, evasion, strafing and short survival retreats; splitter still produces its existing fragments |
| spore, blister | Spore harasser: standoff, flanking/strafe, observed projectile lead, post-shot repositioning, cover and retreats |
| bacillus, filovirus | Colony tactician: coordinate tissue approaches, flank toward tissue, regroup under pressure, preserve latch/tear and scripted inlet anchors |
| guard | Armoured tissue breaker: relentless objective pressure and protect wounded colony members with existing armour |
| amoeba, rogue | Territorial defender: bound tactical destinations around the assigned node; counterattack tissue, retreat/cover/regroup when wounded |
| colony, eight mission bosses, Mega Virus, nests, segments | Existing scripted abilities/phases and spawn rules preserved. Boss presence informs ordinary pressure; nests produce AI-controlled larvae. No new boss controllers |

## Configuration and adding species

Pass overrides through `new Simulation(area, { ai: { seed: 17, sightBudget: 24, pathsPerStep: 2, maxPressure: 5 } })`. `AI_CONFIG` contains scheduling, memory, pressure and event bounds. `AI_PROFILES` contains aggression, courage, awareness, reaction, preferred distance, sophistication, teamwork, evasion, accuracy, target weights, perception ranges, territory, commitment and supported actions. Tactical modifiers read `sim.difficulty` dynamically, including after a mission restart. No new dependencies, workers, online services or real-time LLM calls are used.

To add an ordinary species, define its existing attack-family/stats/model as usual, add its key to `SPECIES_AI`, and choose or extend a profile. Keep its `behavior` in the existing `virus`, `bacillus` or `spore` families to reuse combat. Add a new utility action's eligibility/score in `decide` and execution/completion in `chooseDestination` only if existing actions cannot express it. A genuinely new attack needs a simulation adapter with windup, impact and cooldown, then focused tests. Scripted bosses remain opt-in; do not accidentally assign them an ordinary controller.

## Debugging and reproduction

F3 toggles the debug view during normal gameplay; Shift+F3 cycles all/vision/navigation/cover/squads layers. It shows IDs, archetypes, selected actions, attack states, targets, visibility, remembered positions, roles, supported utility scores, transition reasons and recent failures. The map shows sight cones, short sensing ranges, route waypoints, destinations, cover candidates and roles. Average/peak/last enemy-loop CPU time and current LOS/path budgets are included. No panel/canvas is allocated until enabled. Co-op displays server decision summaries; detailed server memories/routes/timings are intentionally not transmitted.

Commands:

```sh
npm ci
npm test
npm run check
npm run test:ai
npm run benchmark:ai
npm run profile
```

Open `http://127.0.0.1:8027/__ai` for the reproducible rendered combat harness. Its arena/count controls exercise 20 or 40 existing models with a moving suit, disturbances, restored health and live debug telemetry. `/__profile?areas=artery,lungs&enemies=40&step&quality=low` is the existing renderer profiler with simulation enabled. The shipped game itself needs no build: `dist/` is the deployable artifact.

## Validation and limits

The test suite covers acquisition/FOV/range/reaction, occlusion and attack obstruction, sight loss/stale memory/expiry, investigation, hearing/damage uncertainty, tissue priority, survival/cover, navigation around obstacles, unreachable recovery, spaced reservations, role reassignment, uncertain ally sharing, cooldowns/pressure caps, destroyed objectives, cleanup, deterministic seeded trajectories, co-op targets/snapshots, defensive interposition and tactical difficulty. Every arena's tissue routes and a 40-enemy soak are checked. The original model, resource, weapon, boss, campaign, co-op networking and controller suites run together. The old omniscient tissue-selection test was updated to require a sensed node; a pre-existing gamepad expectation was updated to include the already-existing `swap: false` field, without changing controls.

Headless benchmark results are checked into `tools/performance/ai-results.json`: Node 22.16.0, Windows, Intel i9-13900F; ten arenas × two populations, 300 warmup plus 1,800 measured 60 Hz steps per scenario. These measure the enemy update loop; `wholeP95Ms` also includes projectiles. No rendering or spawning is included. Synthetic positions, health restoration and disabled spawns keep population/composition repeatable; this is not a human difficulty study or a 60 FPS guarantee. The AI RNG is repeatable; existing player spread and the balance bot still use their original random sources.

Measured on 2026-11-21:

| Active ordinary enemies | AI p95 range across ten arenas | Worst sampled AI step | Largest scenario setup (construct + start) |
| --- | --- | --- | --- |
| 20 | 0.068–0.180 ms | 0.914 ms | 7.491 ms |
| 40 | 0.121–0.252 ms | 0.921 ms | 3.995 ms |

There were 14 bounded failed searches among 10,486 route searches; every arena's explicit player-to-tissue route check passed. Maximum budgets stayed at or below 24 perception rays and two searches per step. The browser's rendered 40-enemy artery and lung harnesses reported about 60 FPS and 0.7 ms AI p95 in the observed samples at the default approximately 911 × 759 viewport, Low quality, with the debug map enabled. This includes actual Three.js models, animation and rendering, but is a short synthetic sample on this desktop. Both encounters and the real campaign/training/Free Mode deployment had no captured console warnings/errors. F3 and Shift+F3 were checked in the actual game; a normal gameplay screenshot was captured.

Final automated verification passed all 70 tests, including 24 tactical AI tests, and `npm run check`. A Medium balance smoke run used four trials for each of the existing anchor/rover bots in all ten missions (80 runs), with at least one win in every mission; results are in `tools/performance/ai-balance.txt`. The colon remains demanding (0/4 anchor, 2/4 rover). These bot runs are stochastic and are evidence of playability rather than proof of fair human balance. The existing GitHub Pages syntax-check/deployment workflow is unchanged; the connected push credential does not have workflow-edit scope.

Navigation intentionally uses conservative 2D footprints for floating/crawling ordinary enemies, matching existing collision semantics and bobbing heights. It does not model arbitrary 3D overflight, destructible geometry, partial exposure or dynamic NavMeshes. A handful of projected goals in the synthetic crowded benchmark fail bounded graph searches and recover through cooldown/replanning; that is recorded rather than hidden. Director leases limit ordinary attack opportunities, not all scripted boss damage. Authored boss scripts retain their existing enhanced awareness and phases. Long human playtesting across hardware, all difficulties, full co-op sessions and GPU profiling remain appropriate follow-up work.
