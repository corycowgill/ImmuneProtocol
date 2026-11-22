# Encounter variety

Ordinary waves now contain up to three distinct, announced encounters rather than the entire roster arriving at one steady cadence. The planner draws four-member groups from enemies already authored for that wave, retaining the exact species counts and existing health, damage, attacks, score and difficulty modifiers. It does not mutate the shared mission tables or create bonus enemies.

| Pattern | Composition and decision for the player |
| --- | --- |
| Swarm Pincer | Four mobile pathogens converge from two widely separated approaches. Cover both angles around the named node. |
| Spore Crossfire | Two spitters enter from different fronts with two mobile escorts. Break one firing line before they establish both. |
| Colony Convoy | A guard enters ahead of two tissue attackers and a ranged/mobile escort. Get around the armour to intercept the fragile attackers. |
| Decoy Rush | Two aggressive mobile pathogens threaten one node; after a pause, two tissue attackers approach a different, pre-announced node. Decide how much attention to give the diversion. |
| Tissue Siege | Two tissue attackers and ranged support concentrate on one node, accompanied by a mobile pathogen or guard. Prioritize tissue damage over the distraction. |
| Predator Pack | Three mobile hunters pressure visible suits while a spitter takes another angle. Reposition without abandoning the objective. |

Only patterns supported by the current roster are eligible; no species is invented or substituted. Each wave avoids repeating its selected pattern. Fresh deployments choose a seed; a specified `encounterSeed` (or AI seed) makes the plan reproducible. Wave checkpoints store that seed, so checkpoint retries rebuild the same groups and nominal timings. Targets and safe approaches are committed at each warning using the current field state, allowing counterplay rather than live tracking of a hidden suit.

## Pacing and fairness

Encounter groups occupy approximately 13%, 44% and 74% of the roster. Their members enter at a compressed but bounded cadence, with space afterward before the original arrival schedule resumes. Decoy Rush has an additional pause between its two fronts. At most one wave enemy is released per simulation step, with at least 0.55 seconds between arrivals; a delayed frame cannot dump a backlog at once.

Each group gets at least four seconds of warning. The existing HUD marks its actual entrances and shows the name, target node, countdown, tactical cue and remaining group members. The card becomes compact after arrival. Decoy Rush identifies both targets and changes to the main breach as the tissue attackers arrive. Existing audio cues announce warnings and the turn. Information is kept in one card instead of duplicating a large centre-screen alert.

New group spawns stay at least 18 m from living suits and tissue. The planner first uses authored inlets and can search a bounded outer-ring fallback. If suits move onto a warned inlet, the group commits a safe replacement and warns again; it does not appear beside the suit. Groups hold when 28 enemies are active and offer up to five seconds of additional relief for critical suit/tissue health. A healthy node can replace a critically damaged target when a warning is committed. Existing attack-pressure limits still govern actual attacks.

Orders last at most 24 seconds and give ordinary AI a role, assigned node and an approach waypoint. Defenses, direct perception, memory loss, attack windups and cooldowns still apply. Sharing an encounter never grants knowledge of a hidden player's position. Splitter offspring inherit group identity; a group is not reported neutralized until those fragments are gone. Clearing a group awards no additional score.

The guided training wave, Heart Valve patrol, Capillary Junction surges, lung airway finale, gastric scripted transitions and Mega Virus wave retain their existing arrival systems. Ordinary waves in artery, lungs, stomach, intestines, colon, lymph, ear and brain receive the new patterns. Boss arrival still waits for the complete wave roster. Boss HUD/attacks take priority over encounter notices, and wave clear/reset/mission end release the plan and public state. Existing brood nests, caches and hazards remain in place.

## Implementation and extension

`dist/encounters.mjs` owns the data catalog, roster-preserving planner, safe approach search, bounded scheduler and serializable public summary. `Simulation.beginWave/spawn/step` supply the existing integration points. `tactical-ai.mjs` honors temporary orders in the existing controller loop. `encounter-ui.mjs` draws the compact card; `hud.mjs` reuses the field-marker and offscreen-arrow system. Co-op snapshots include current encounter state, not private future plans, so reconnects recover current warnings without replaying a missed event. No new dependencies, models, audio assets or online AI services are used.

To add a pattern, add a unique catalog entry with four ordered species sets, one or two fronts and a concise counterplay cue. Add a focused assignment/timing rule only if its behavior differs from the existing arrangements. Test exact roster preservation, warning lead time, safe sites, checkpoint determinism and co-op serialization. The initial schedule can be inspected with `new Simulation(area, { encounterSeed: 31 })`, `sim.start()` and `sim.encounterPlan` in a local development harness. Eligibility, warning time, spacing, safe distances, pressure gate and order duration are defined in `ENCOUNTER_RULES`.

## Validation

Run `npm run test:encounters`, `npm test`, `npm run check` and `npm run benchmark:encounters`. The encounter tests cover every mission/difficulty roster, all six actual compositions, seed variety/reproduction, checkpoint restoration, scripted exclusions, real wave integration, four-second warnings, occupied-inlet rerouting, separated approaches, feints, pressure holds, bounded relief, AI orders, one-time clear events, Splitter descendants and co-op snapshots.

Final verification on 2026-11-21 passed all 110 tests, including 16 encounter tests, plus the syntax checks. A real Free Mode deployment in the browser showed the warning card, countdown, target and both approach markers, followed by the compact active-group card. The card was adjusted after visual inspection to avoid the wave counter and duplicate centre-screen announcements. No console warnings or errors were captured. Approach orders also have a regression check that preserves ranged stopping distance when AI reacts to a suit instead of following its waypoint.

`tools/performance/encounter-results.json` records the scheduler-only benchmark for all 27 eligible ordinary waves, solo and three-player co-op, using seed 31 and actual arena geometry. Each suit stays at its initial position, enemies have a fixed ten-second lifetime, and combat AI/rendering are excluded to isolate scheduling costs. The run plans 81 groups per mode and retains the respective solo/co-op authored roster sizes. `encounter-balance.txt` records a separate stochastic Medium campaign smoke test using four trials per mission for each existing anchor/rover bot (80 runs). These fixtures do not establish human balance or frame-rate guarantees.

Measured on Node 22.16.0, Windows, Intel i9-13900F:

| Mode | Groups / authored spawns | Largest scheduler p95 | Worst scheduler step | Largest wave setup |
| --- | --- | --- | --- | --- |
| Solo | 81 / 1,275 | 0.001 ms | 1.492 ms | 0.163 ms |
| Three suits | 81 / 1,354 | 0.001 ms | 2.252 ms | 0.090 ms |

Warnings perform infrequent approach searches, so steady-step p95 is much smaller than the worst sampled step. Every benchmark wave released its entire roster without stalling. The final Medium bot sweep won 73 of 80 runs, with at least one win in every mission. Colonic Reservoir remains the most demanding area (1/4 anchor, 3/4 rover); full human and live co-op playtesting remain useful follow-up work. Existing GitHub Pages deployment checks remain unchanged.
