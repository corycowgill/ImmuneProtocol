# Boss battle logic review

The review started from `2f5565c`, including the other team's game/world module split and wave checkpoints. The changes stay inside the authoritative simulation and existing rendering/HUD adapters; all ten bosses keep their models, health, damage values, scoring rules, mission arrival rules and signature mechanics.

The main defects were ground bosses walking through solid terrain; charges relying on endpoint collision; co-op victims changing during a charge warning; cover failing to stop melee/pulls; one extra drain/heal tick after the Leech had been interrupted; unrestricted boss summons; moving pulse origins during the Screamer's warning; overlapping Tapeworm segments on arrival; and stale or sealed Mega Virus core hits being accepted. Boss attacks also needed clearer commitment and recovery periods.

## Changes by encounter

| Encounter | Improved behavior and counterplay |
| --- | --- |
| Thrombus Titan | Routes around clots while stalking. Announces and locks a co-op victim, commits direction for the final 0.4 s of its 1.15 s windup, and locks charge speed for that attack. Swept collision catches both terrain and suits; a clot or wall stuns it and exposes armour for 4.2 s. Its charge corridor ends at the predicted collision. Tissue crushes have a 0.85 s tell. Phase two shortens charge recovery and modestly increases the next charge's speed. |
| Capillary Leech | Warns for 0.8 s before latching. Checks interruption/expiry before healing or damaging tissue, so successful interruption stops the next tick immediately. The existing 13% damage break and 2.2 s vulnerability window remain. Below half health it relocates faster and drains for shorter periods, while retaining the warning and break window. |
| Mold Crown | Commits its six-shot volley to the announced point rather than tracking the suit perfectly through the burst. Does not switch victims midway. Solid cover blocks launch; orbiting naturally repositions it. Tissue lobs and seeding wait for the orbit/recovery portion of the pattern. Summons are capped, and phase two slightly shortens volley recovery and widens the spread without increasing shot count/damage. |
| Pylori Drill | Chooses a reachable eruption position, stops moving before the full one-second eruption warning, and shows the fixed danger footprint while hidden. Burrowing blocks every damage entry point, including environmental digestion. Surfacing provides the existing seven-second punish window with 125% incoming damage. Phase two shortens underground travel time while preserving warning/exposure durations. |
| Tapeworm | Starts with separated segments along a real trail instead of seven overlapping bodies. Head movement respects terrain. Tissue and suit bites have a 0.65 s committed windup, pause the head and recheck range/cover at impact. Segment shielding and speed gains from lost segments remain; phase two adds modest movement/bite pressure. |
| Biofilm Colossus | Navigates at full body clearance. Tissue crushes and suit slams are separately telegraphed; cover and distance both stop the slam. A missed or landed slam leaves a 1.15 s recovery at 120% incoming damage. Brood thresholds are at least three seconds apart and obey summon caps. Regrowth and shrinking remain, with modestly faster phase-two slam recovery. |
| Rogue Macrophage | Uses visible living suits, short-lived last sightings/damage origins and bounded threat from recent attackers. Warns for 0.9 s before pulling a locked victim; breaking LOS cancels the pull before further movement. The existing 5% damage break still exposes it for 2.4 s. Contact strikes now warn for 0.65 s. Pathogens it eats release ordinary AI resources immediately. |
| Otolith Screamer | Commits its pulse origin throughout the 2.4 s warning, so chosen cover stays valid. Cover blocks the pulse, including tissue damage through solids. Pulses leave a 1.2 s punish window at 120% incoming damage. Its existing below-half relocation/faster-pulse behavior remains. The global LOS pulse uses text/model/counter tells; a finite ground ring would falsely imply that distance alone is safe. |
| Heart colony | The valve retains its timings and aperture. Colony tears now have a visible 0.65 s windup when the valve exposes it; closing the valve cancels a pending tear. Its existing damage and repeat interval remain. |
| Mega Virus | Retains all three core phases and exposure patterns. Hits must reach a currently exposed/open core; rockets also retain and revalidate the launch phase, cycle and core. Sealed/stale hits cannot damage a later phase. Brood spawning stops at the exact existing cap of six. The final hit credits the correct suit once, with no repeated score/kill awards after defeat. |

All eight mission bosses announce a monotonic second phase at half health; healing does not reset it. This changes timing/pattern pressure rather than silently raising damage or health. The Heart and Mega Virus retain their own existing phase systems.

## Shared implementation

`boss-tactics.mjs` holds enhanced 360-degree boss vision (75 m maximum), cover checks, four-second last sightings, recent-attacker threat and a preference for the current co-op target. A sighting or damage origin is copied into memory; hidden players are not live chase references. Charge and pull victims are explicitly locked by their attack state machines. Navigation is cached in a WeakMap outside snapshots, using the existing visibility graph with each ground boss's full radius. Flying and burrowing movement keep their existing constraints. There is no second boss update loop.

Boss summons are tagged by owner and limited to eight living summons, with a global 24-enemy ceiling for new boss summons. Existing wave spawning is unchanged. The encounter director reserves two ordinary pressure positions during major boss windups/charges/pulls, leaving room for counterplay without cancelling already committed enemy attacks. Outside major attacks it retains the ordinary boss reservation.

The on-screen danger overlay, attack callouts and countdowns have since been removed at the player's request: bosses are read from their own windups, glow and audio. The simulation still computes the footprints below (the AI and tests use them). Originally, `boss-telegraphs.mjs` drew one reusable SVG overlay from serialized simulation footprints. Rings, bite areas and charge/pull lanes are projected onto the existing floor. Visible outline fragments remain readable when the player is inside a footprint; edges crossing the near plane are omitted. The overlay needs no Three.js geometry, shader or per-boss GPU resources. `hud.mjs` displays phase and warning/recovery countdowns; the existing model membrane glow and audio cues are reused. Co-op snapshots carry only serializable state and footprints.

## Verification

```sh
npm test
npm run check
npm run test:bosses
npm run benchmark:bosses
node tools/balance/balance-bot.mjs --difficulty medium --trials 4
npm run profile
```

Open `/__bosses` on the profile server for the reproducible rendered fixture. Pick any of the ten encounters, restart, trigger its main attack, move it to phase two, and pause a warning for inspection. Health is restored in this fixture, so it is a renderer/logic soak rather than a difficulty test.

The focused regressions cover boss vision/memory, co-op focus and victim commitment, full-radius navigation through every authored ground-boss arena, swept charge collisions, interrupted draining, committed volleys, summon caps, fixed/immune burrowing, cover/distance/recovery windows, staggered brood, pull cancellation, phase monotonicity, serializable telegraphs, separated Tapeworm arrival, valve tear cancellation, stale core rejection and exactly-once Mega Virus credit. Existing boss mechanics, models, checkpoints, weapons and co-op networking are also tested by the full suite.

`tools/performance/boss-results.json` records 90-second, fixed-step encounters for all ten bosses in solo and three-player co-op, including a half-health transition and scripted moving/nearby suits. Samples exclude the first five seconds; health restoration keeps the encounter alive. CPU timings include enemy updates/projectiles and ordinary summoned AI, with no rendering. `boss-balance.txt` records the separate stochastic 80-run Medium campaign smoke test; winning bots do not establish human balance.

Verification on 2026-11-21: all **94 tests passed**, including 20 new boss regressions, plus the syntax checks. On Node 22.16.0 / Intel i9-13900F, the worst encounter p95 was **0.064 ms solo** and **0.037 ms with three suits**; worst single samples were 1.158 and 1.216 ms respectively. These CPU-only measurements include summoned ordinary AI and do not establish rendered frame-rate guarantees. The soak stayed at nine or fewer enemies (boss plus bounded summons; the Tapeworm includes its segments).

The 80-run Medium smoke test had at least one winning strategy in every mission; the moving rover won all 40 of its runs. The anchor won 34/40, with losses in lungs, colon and lymph. Results remain stochastic. Browser checks verified the Colossus slam boundary, Titan charge lane and fixed hidden Drill eruption footprint using actual models, plus normal Heart Valve deployment/HUD operation. No console warnings/errors were captured in those checks. The shared telegraph view is integrated into the actual game HUD, not confined to the verification page.

The projected footprints use the game's logical 2D solids. They do not add arbitrary 3D navigation, physical cover-height simulation, multiplayer latency prediction or new boss assets. Human playtesting across difficulties/hardware and longer co-op sessions remain useful. The existing deployment workflow is unchanged.
