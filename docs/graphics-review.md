# Immune Protocol: Visual Quality Review (AAA bar)

Reviewer role: senior UX designer / art director, FPS.
Build: `dist/`, High quality preset, captured with the `/__look` fixture (`npm run profile`). Screenshots are 1280x720 from a headless software rasterizer, so frame rate and minor aliasing are ignored. Where an artifact could be caused by the rasterizer, I say so and give a way to check it.

Evidence reviewed:
- Front end: `shots/00-intro-2000`, `00-intro-6000`, `01-loading-or-title`, `load-12`, `load-24`, `10-title`, `11-briefing`, `12-briefing-loadout`, `14-armory`, `15-gunsmith`, `16-customize`, `17-guide`, `18-manual`, `19-settings`, `20-coop`, `21-title-again`.
- Gameplay: `before/b-artery-{a-spawn,b-reverse,c-enemies,d-firing,e-kills,f-aim,g-melee}` and `before/b-lungs-{a-spawn,b-reverse,c-enemies}`. These were the only arena captures present at my final re-list (see Appendix).

Coordinates are `(x,y)` in pixels at 1280x720.

---

## 1. Overall verdict

**What already works**
- The key art and title-screen composition (`10-title`) set a strong tone. The large condensed "IMMUNE / PROTOCOL" wordmark, the lime accent and the dark-teal UI on top of the organic art are coherent and on brand.
- The rendering pipeline underneath is solid: an HDR target, SSAO, depth-marched ground mist, a 6-mip bloom chain, ACES, per-arena grade tables (`post-fx.mjs` `LOOKS`), and a separate weapon pass. Most fixes below are parameter, shader or compositing changes, not new systems.
- The enemy roster has distinct silhouettes in the Disease Guide (rogue bot, crawler, crown virus, spore, bacillus, splitter, shellback). The lungs arena has a distinct palette and setting (pink haze, alveoli clusters, iridescent bubbles).
- The front-end information architecture is clean. Screens share a header and footer, a Back affordance and a lime primary CTA.

**What reads as non-AAA**
1. **Weapon feedback.** The muzzle flash renders as a flat, opaque cream polygon (`e-kills`) or not at all (`d-firing`). Tracers are 1-px hairlines. In ADS the reticles don't line up and the receiver covers about a third of the screen. Shooting is what players look at most, and right now it is the cheapest-looking part of the game.
2. **Monochrome red frame with clipped highlights.** In the artery, roughly 90% of pixels share one hue. Floor speculars blow out to white, and black enemies crush to 0. Pathogens don't separate from the background. The lungs swing the other way into a milky, low-contrast haze.
3. **The HUD is web dashboard, not combat HUD.** It uses flat translucent rectangles, Inter at 9–11 px, and mouse buttons (mute, pause) in the combat HUD. There are also visibly broken strings: "SCORE 0 0 kills", a lone "1 2", "Venous Wall ·" with an empty second line, and "G GRN ◆◆ T STN ◆".
4. **The front end is a SaaS form layout.** Menus are bordered cards on a dimmed photo. The co-op screen is a 900×600 empty box with one developer sentence. Bindings are plain text, and toggles are rendered as buttons.

Net: the 3D world and post pipeline are AA-plus. The **interaction layer (gun, hits, HUD, menus) is what makes the game read as amateur**. That layer is also the cheapest to fix.

---

## Sprint status (2026-11-24)

What the graphics sprint changed, per catalog item. Items not listed were left for a later pass.

| ID | Status | Change |
| --- | --- | --- |
| W-01 | Done | New layered muzzle flash (`shot-fx.mjs`): star front flash, crossed flame petals and a hot core, re-rolled every shot, HDR so it blooms. Weapon-scene glows use custom blending that adds light without writing alpha, so the composite no longer cuts a hole in the arena. |
| W-02 | Done | Tracers are camera-facing HDR ribbons that travel from muzzle to impact with a fading tail and never drop below about two pixels wide (`TracerPool`). Sniper, pellet, rifle, teammate and turret tracers each have their own width, life and length. |
| W-03 | Partly | Reflex and red-dot sights project a glowing ring-and-dot reticle in the glass (`createHoloReticle`) instead of a tiny sphere. Model push-forward during ADS not changed. |
| W-04 | Done | Weapon hemisphere and bounce lights take the arena's mist and fog colours on every arena change. |
| W-06 | Partly | Every weapon material wears its sharp edges procedurally (screen-space curvature), not only where the baked atlas says; the factory receiver and rubber are lifted out of near-black, and a soft fill light from the eye keeps faces turned toward the camera readable in aim-down-sights. No geometry changes. |
| W-07 | Done | Gloves are olive-grey woven fabric with worn leather palms, plus moulded ivory armour plates on the backs of the hands and knuckles. |
| N-04 | Done | Rogue Bot and Crawler: procedural biofilm builds up from the underside with drips and spots in the arena's own fluid colour, worn wet and glossy, so the top stays medical white; the red optics are HDR so they bloom. |
| W-05 | Done | Hip pose sits lower and further out (y −.255 → −.27, z −.60 → −.64). |
| H-01 | Done | World markers redrawn: in view, a diamond pin under a caps label and range; at the screen edge, a tag with a node-coloured left rule and an arrow pointing toward the target. Trailing "·" and clipped distance lines fixed. |
| H-02 | Done | Score reads "SCORE 1,240 · 12 KILLS" (per player in co-op). |
| H-03 | Done | Carried weapons drawn as key-capped chips with the drawn weapon lit; the raw "1 2" fallback is gone. |
| H-04 | Done | One tick per round under the ammo count; smoked-glass HUD panels with clipped corners and accent brackets. |
| H-05 | Done | Four ability tiles with drawn icons (grenade, stun, dash, bash), key caps, charge pips and a recharge sweep. |
| H-06 | Done | Outlined white crosshair with a centre dot. Hit marker: white for a hit, amber for a critical, larger red cross and ring for a kill. Directional damage wedge with a chevron toward the attacker, a red edge vignette on hits and a pulsing low-integrity vignette (replaces the full-screen red tint). |
| H-07 | Done | Mute and pause hide while the mouse is captured (touch keeps them). |
| H-08 | Done | Wave panel label centred and tracked. |
| H-09 | Done | World labels in tracked caps with a drop shadow. |
| H-10 | Done | Organ hazard countdowns are an amber warning strip with a hazard glyph that pulses. |
| H-11 | Done | Found after the review, in the boss captures: the boss panel was a 145 px box with the health shown twice. It is now a compact name, percentage and 40-cell health bar, with the phase underneath. |
| V-02 | Done | Spore spit glows (HDR emissive core, additive pulsing halo, additive trail). |
| V-04 | Done | Lens fringe .0005 → .00014. |
| V-05 | Done | Vessel clearcoat roughened so the curved highlight no longer streaks. |
| V-07 | Done | Bloom .55 → .7; flashes, tracers, sight reticles and the spore halo are HDR. |
| V-01 | Done | Spray particles have individual sizes that shrink as they fade, fluid drag and an HDR start; every hit also flings short, thick droplet streaks of the pathogen's fluid back toward the shooter and out the far side (a liquid, normally blended ribbon pool). |
| N-05 | Done | Found while checking hits: sustained fire strobed large pathogens white because the muzzle light reached 15 m at high strength. It now lights only the floor and walls around the suit (7 m, about a fifth of the strength), and deflected-round sparks are smaller. |
| L-01 | Done | Cooler bloodstream fill light, less chroma in fog and mist, cool-shadow and warm-highlight split toning in the finishing pass (per-arena `shadowTone` / `highlightTone`). |
| L-02 | Done | Rougher floor coat, artery bulb 310 → 200, exposure 1.18 → 1.14. |
| L-03 | Partly | Brighter ground hemisphere colour in the bloodstream arenas. |
| L-04 | Done | Lungs: slightly more contrast, less and shorter-reaching mist, a little less magenta. |
| E-01 | Done | The lump at the bottom of the view was a platelet lying just behind the bloodstream insertion point; platelets now keep 3.5 m clear of it. Drifting red cells also shrink away within about two metres of the camera so they can't fill the lens. |
| L-05 | Done | Raised ridges and shelves sample the tissue texture at two scales and angles (albedo and normals), so its swirl bands no longer repeat along a ridge as wood grain. |
| V-03 | Done | Smoke and hit-mist puffs use a domain-warped noise texture with a ragged edge and denser core instead of soft round blobs. |
| V-06 | Done | Lungs: the wind-streak ribbons were already running faintly before the exhale, reading as white scratches across the view; they now barely stir until the gale, which keeps its strength with fewer, thinner, mist-tinted streaks. |
| L-06 | Done | Light shafts feather toward their silhouettes, fade well before the floor and canopy, and break into drifting dust streaks instead of flat cones. |
| F-06 | Done | Armory stat tiles draw the bars the Armory already computed: fill toward "better", with a previewed part's gain in green or loss in red and the difference beside the value. |
| F-12 | Done | The operator record is a slim strip under the menu, in the shaded text column, so it no longer covers the key art; an empty best score reads "No runs yet". |
| E-02 | Done | Platelets darker and wetter (amber, not beige gravel). |
| N-01 | Done | Shared fresnel rim light on every pathogen material, colour and strength per arena (`setPathogenRim`). |
| F-01 | Done | Co-op without a server shows a designed "Squad link offline" state with how to play online. |
| F-02 | Done | Title-menu entries are borderless condensed caps rows over hairlines; hover or focus slides in a lime bar and a fading sweep. Short buttons and tabs everywhere read in tracked caps (one case rule), and every content pane uses the HUD's clipped-corner frame with accent brackets. Buttons are also lit from above, with a glow on the primary action. |
| F-03 | Done | Loading and title key art at full strength with directional shading for text, a thicker progress bar with a glowing head. |
| F-04 | Done | Skip prompt sits on a dark pill over video. |
| F-08 | Done | Turntable previews framed with viewfinder corners and a LIVE tag instead of a stray dash. |
| F-09 | Done | Field Manual bindings drawn as keycaps. |
| F-10 | Partly | ON/OFF settings drawn as switches; scrollbars have a visible track and a rounded thumb. |

`/__look?area=<arena>&scenario=<boss|brain|airway|gastric|hazard>` (served by `npm run profile`) renders one arena at High quality on demand through `window.__look` (`view`, `spawn`, `run`, `frame`), so the same staged moments can be photographed before and after a visual change, even under a software rasterizer.

---

## 2. Issue catalog

Severity: **P0** = immediately reads cheap; **P1** = noticeable; **P2** = polish.

### Weapon & first-person view

**W-01 · Weapon & FPV · P0: Muzzle flash is a flat, opaque cream polygon, or invisible**
- Evidence: `b-artery-e-kills` shows a hard-edged pentagon of flat cream (~RGB 235,225,200), about 70×60 px, at the barrel tip (700–760, 385–440). It has no gradient, no glow and no bloom, and it occludes the world behind it. `b-artery-d-firing` was captured mid-burst (ammo 30→27) and shows no flash and no light on the barrel.
- Why it hurts: the flash is the main "power" read of a gun. A flat beige card looks like a texture-loading failure.
- Root cause (code): `shot-fx.mjs` builds the flash from additive planes in `weaponScene`, which renders into `weaponTarget` cleared to alpha 0. `post-fx.mjs` `combine` then does `color = color * (1. - weapon.a) + weapon.rgb`. With `THREE.AdditiveBlending` (SrcAlpha, One applied to alpha as well), the flash writes alpha. So instead of adding light, it **cuts out the scene behind it** and replaces it with its own LDR colour. The colours are also LDR (`0xffd9a0`, opacity .95), so after ACES at exposure 1.18 they land on cream, not white-hot, and never cross the bloom threshold (.95).
- Fix:
  1. Give the flash materials (and every additive mesh in `weaponScene`) `blending: THREE.CustomBlending, blendEquation: AddEquation, blendSrc: SrcAlphaFactor, blendDst: OneFactor, blendSrcAlpha: ZeroFactor, blendDstAlpha: OneFactor`. They then add light without writing coverage alpha.
  2. Drive the flash in HDR with `material.color.setRGB(1, .85, .6).multiplyScalar(6)` for the core and `×3` for the petals. Remove `toneMapped: false`, since the post chain tone-maps anyway.
  3. Sharpen the flash's on/off envelope: hold 1 frame at full, then 1 frame at 40%. Also scale `weaponFlash` (PointLight) intensity 3.4 → 8, and `shotLight` 42 → 60, so the receiver and glove visibly light up.
  4. Check on a real GPU that the canvas texture alpha arrives, since SwiftShader can mishandle premultiplied canvas uploads. Even so, steps 1–3 are needed.

**W-02 · Weapon & FPV · P0: Tracers are 1-px pale-green hairlines**
- Evidence: in `b-artery-e-kills`, a thin, flat, pale-green line runs from (720,395) to the crosshair (645,365). It has no head glow and is no wider than a pixel.
- Why it hurts: tracers are the shot's direction cue. A hairline reads like a debug ray.
- Root cause: `world.shotMaterial = 0xd6ffc4` uses `additive(map, color, 1)`, so a value ≤1 in HDR never blooms. Width is .026 m, which at 10–20 m is under a pixel.
- Fix: in `TracerPool.material()`, multiply the colour into HDR (`new THREE.Color(color).multiplyScalar(5)`). Set a minimum screen-space width: in `update()`, scale `width` by `max(1, dist * 0.0022 / width)` so it never drops under ~2.5 px. Raise the player rifle tail from 7 to 10 m. Add a 0.03 s HDR "head spark" sprite at the impact point.

**W-03 · Weapon & FPV · P0: ADS shows two non-concentric reticles and a weapon that blocks the screen**
- Evidence: in `b-artery-f-aim` (crop), the sight window shows a beige 4-tick cross centred on the screen (640,360) and a separate green dot about 20 px right and 6 px down (660,366). The optic housing and receiver (560–910, 330–720) are near-black slabs that cover about 30% of the frame, and the ivory slab (530–860, 490–590) fills the lower centre.
- Why it hurts: an off-centre dot tells the player the gun is inaccurate. The housing makes ADS feel claustrophobic, and the dark unlit block reads as a missing material.
- Fix:
  - In `carbine.mjs`, make the `createHoloReticle` the only aiming mark. Hide or relocate the green emissive sphere, or move it to the side of the housing as a "power LED". Then make sure `world.weaponSight` equals the reticle's world offset (`factoryReticle.position` = `0,.142,-.138`) so the dot lands exactly on the screen centre.
  - When `aim > .5`, push the model forward (`z` -.61 → -.50) and lower the receiver (`y` offset +0.015) so only the hood frames the view.
  - Narrow the camera FOV by 15–20% during ADS (`camera.fov = lerp(baseFov, baseFov / 1.2, aim)`).
  - Add a rim/back light to `weaponScene` aligned to the camera (`weaponRim` from behind-above) so the rear faces don't go to RGB 0.
  - Give the reticle HDR emissive (`emissiveIntensity` 4) so it blooms slightly.

**W-04 · Weapon & FPV · P1: Weapon lighting ignores the environment (pasted-on look)**
- Evidence: in every artery shot, the carbine's grey and ivory parts are lit neutral or warm-white (`a-spawn`: ivory slab RGB ~225,210,190) while everything around them is saturated red. In `b-lungs-a-spawn` the gun is identical even though the world is pink and milky.
- Why it hurts: viewmodel and world light mismatches are the single biggest "Unity asset pasted on" tell.
- Fix: in `world.mjs` `setArea`, tint the weapon lights per arena. Set the `weaponScene` HemisphereLight sky colour to `lerp(0xf9ded4, LOOK.mist, .45)` and the ground colour to `fog colour × 1.4`. Give `weaponBounce` the arena floor colour (artery ~0xb03a30) at 1.6. Add a coloured environment map: PMREM of a 2-colour gradient made from fog and backlight.

**W-05 · Weapon & FPV · P1: Viewmodel is too big, too close and collides with the HUD**
- Evidence: in `a-spawn`, the weapon spans 720–1280 × 410–720 (about 28% of the frame) and the muzzle sits 80 px from screen centre. The ammo panel (1030–1240, 597–707) is drawn over the stock, and the weapon-strip "1 2" floats over the receiver (1045,575).
- Fix: in `weapon-view.mjs`, change the hip pose to `x = hipX + .02`, `y = -.285`, `z = -.66`, and scale the model by 0.9 (or reduce `weaponCamera.fov` by 5°). The target is a muzzle at ~(800,420) and a stock that leaves the bottom-right 220×130 px clear for the ammo readout.

**W-06 · Weapon & FPV · P1: Weapon model reads as primitive box modelling**
- Evidence: in `a-spawn`, the optic is a hollow rectangle (890–1030, 410–500) with hard 90° edges. The rail is a black slab with uniform ribs. The ivory body panel is a flat planar slab with no seams or bevel highlight. In `14-armory` the same model in a lit studio confirms there are no edge highlights or panel lines.
- Fix: everything is procedural, so:
  - Raise `bevelSegments` and `bevelSize` on all `ExtrudeGeometry` and `panel()` calls (.005 → .008).
  - Generate a procedural **edge-wear mask**. Use a canvas texture with noise-thresholded light streaks along the UV borders, applied as a `roughnessMap` (0.25 on worn edges) and a mix into `map`.
  - Add 1-px dark panel-line decals with a canvas `strokeRect` grid on `molded`.
  - Add a small stencilled serial or arrow text (canvas) on the ivory panel.

**W-07 · Weapon & FPV · P2: Glove is a featureless black blob**
- Evidence: `a-spawn` (730–790, 520–600) and `e-kills` (740–800, 520–600) show a near-black mitten with no knuckle definition.
- Fix: raise glove albedo to 0x3a3d40. Add a woven bump map (already exists) at a higher `bumpScale` (.0016 → .004). Add two ivory knuckle armour plates using the suit colour. With W-04 the rim light will separate it.

**W-08 · Weapon & FPV · P2: Optic glass and emissive strip are flat**
- Evidence: `a-spawn` shows the sight window as fully transparent with no tint or reflection. The green side strip (790–860, 525–590) is a flat green bar with no bloom.
- Fix: glass `MeshPhysicalMaterial` with opacity .26 → .18, `clearcoat: 1`, `envMapIntensity: 1.5`, and a faint teal tint, plus a fresnel highlight. Strip `emissiveIntensity` 1.08 → 3 so bloom picks it up. Also pulse the strip on fire (ammo-linked brightness is already in `carbine.update`, so tie it to `pose.flash`).

### HUD

**H-01 · HUD · P0: Edge markers are broken (empty second line, distance lost, no arrow)**
- Evidence: in `a-spawn` and `c-enemies`, "Venous Wall ·" (41–127, 315–350) and "Lateral Branch ·" (1147–1245, 315–352) sit in boxes about 36 px tall. Each has one line of text and an empty lower half. The distance after "·" is missing, and there is no direction chevron. The same happens in `b-reverse` with three markers.
- Root cause: `ui-screens.mjs` `buildCombat` sizes the label box with `lines × font × 1.3 + 8`, but `CanvasUiRenderer.text()` uses its default `lineHeight = 1.4` and floors the visible line count (`floor((h-8)/(11×1.4))` = 1 for a two-line box). The second line, which holds the distance, is clipped.
- Fix: pass `lineHeight: 1.3` through the `label` kind (`this.text(..., maxLines, 1.3)`), or compute the height with 1.4. Redesign edge markers as a single line: `[chevron] VENOUS WALL  24 m`. Draw the chevron as a canvas triangle rotated to the off-screen bearing and pinned to an ellipse inset 48 px from the screen edges. The box should use the node's colour as a 2-px left border, not a full outline.

**H-02 · HUD · P0: Score readout is malformed: "SCORE 0 0 kills"**
- Evidence: all gameplay shots, top right (1160–1240, 79).
- Root cause: in `ui-bindings.mjs`, `score:` falls back to `t('scoreboard')` (raw `textContent` concatenation) when the row mapping produces an empty string, so "Score", "0" and "0 kills" collapse.
- Fix: build the string explicitly, for example `SCORE 1,240` on one line and `12 KILLS` beneath it in 9-px muted caps. Use `toLocaleString()` for thousands separators and a tabular-nums font so digits don't jitter.

**H-03 · HUD · P1: Weapon slots render as a stray "1 2"**
- Evidence: `a-spawn`, `b-lungs-a-spawn`: "1 2" in 11-px white at (1038–1052, 575) floats over the gun with no chips or names.
- Root cause: `weaponSlots` is filtered by `slot.name`, so empty names fall back to `text(d.weaponStrip)`.
- Fix: always render the `slots` renderer, which already draws key-capped chips. Fall back to the weapon's display name when `name` is empty, and don't render the raw text fallback.

**H-04 · HUD · P1: Ammo panel lacks reserve and round ticks and is drawn over the gun**
- Evidence: `a-spawn` (1030–1240, 597–707): "NEEDLE CARBINE" at 11 px, "30" at 46 px, "TURRET READY" in teal. There is no reserve count and no round ticks: `rounds` is not rendered because `d.magazine` is missing. The panel's smoked glass sits over the ivory stock and produces a muddy rectangle (see crop).
- Fix:
  - Show `30 / 120`, with the reserve at 22 px, 60% opacity, baseline-aligned.
  - Supply `magazine: {size, count}` from bindings so the tick row draws.
  - Move "TURRET READY" out to the ability cluster.
  - Drop the panel fill to 35% opacity, or replace the box with a text shadow plus a 2-px accent underline, which is the modern AAA pattern.
  - Shift the panel down and right by 16 px once W-05 frees the corner.

**H-05 · HUD · P1: Ability panel uses cryptic abbreviations**
- Evidence: `a-spawn` (40–220, 558–600): "G GRN ◆◆ T STN ◆ C DASH V BASH" at 9–10 px. Key letters and ability codes run together, and the meters are 2-px lines.
- Fix: four 36×36 ability tiles. Each gets a procedural canvas icon (grenade: circle with pin arc; stun: lightning zig-zag path; dash: double chevron; bash: fist or stock silhouette), a keycap badge in the corner (14×14 rounded rect, mono 9 px), a radial cooldown sweep (`arc` from -π/2 with 60% black fill), and charge pips under the tile.

**H-06 · HUD · P1: Hip crosshair is low contrast and has no centre**
- Evidence: `b-reverse` crop (5× zoom): four tan ticks (~RGB 190,170,150), 1.5 px, 7 px long, gap 8, at (640,358). The dark outline is not visible against red, and the centre dot is missing or illegible.
- Fix: use pure white `#ffffff` at 0.9 alpha. Raise the outline to `rgba(0,0,0,.75)` at width +2. Draw a 2-px centre dot. Lerp the colour to `#ff5a4a` when the centre ray is over an enemy (a raycast the sim likely already has for aim assist). Add a 40 ms "bloom" of the gap on each shot (the spread already drives `offset`).

**H-07 · HUD · P1: Mouse buttons in the combat HUD; panels all the same weight**
- Evidence: all gameplay shots show 44×44 mute and pause buttons at the top right (1146–1240, 20–64). The tissue-node panel (40–292, 20–152), the wave panel (545–735, 20–112), and the integrity and ammo panels all use the same smoked-glass box.
- Why it hurts: AAA FPS HUDs don't show desktop controls during play. Equal visual weight on every panel means nothing has priority.
- Fix: hide mute and pause during pointer lock and show them only on mouse move with the cursor unlocked. Give priority through weight: the wave counter and integrity stay boxed, while tissue nodes become boxless labels with bars and a left accent. Use `hudPanel()` (clipped corner, accent brackets) consistently; it exists but its corners don't show at this opacity, so raise the accent alpha to 1 and the bracket length to 14.

**H-08 · HUD · P2: Wave panel label misaligned**
- Evidence: `a-spawn` crop: "INFECTION WAVE" starts flush at the panel's left edge (545,27) with no padding, while "01 / 05" and "45 THREATS LEFT" are centred.
- Fix: `buildCombat` asks for `align: 'center'` with `tracking: 1.4` on the `d.mode` label, yet it renders flush-left. Trace why the centred, tracked branch of `CanvasUiRenderer.text()` isn't taken for this item (check that `align` survives the `text()` helper spread). Either centre it like the numbers, or left-align all three lines with 12-px padding. Don't mix the two.

**H-09 · HUD · P2: World-space labels lack backplates and use inconsistent case**
- Evidence: "Arterial Core" (607–673, 288/319) is 11-px Inter, sentence case, lime, with no shadow, over bright tissue and enemies (`g-melee`: overlaps a spore cloud). In lungs, "Left Alveoli" and "Right Alveoli" fade into the haze.
- Fix: caps with +0.08 em tracking to match the HUD. Add a 1-px dark text stroke (`strokeText` with `rgba(0,0,0,.7)`, lineWidth 3, before fill). Add a small diamond glyph above the anchor. Fade the label to 0 within 6 m and when it is under the crosshair.

**H-10 · HUD · P2: Lungs hazard banner placement**
- Evidence: in `b-lungs-a-spawn`, "EXHALE IN · 8s" in a yellow-outlined box (545–735, 125–155) is stuck directly under the wave panel. It looks like a tooltip, not a timed threat.
- Fix: render as a centred hazard strip: a 2-px amber bar that drains over the countdown, a large 20-px timer, and a pulse at ≤3 s.

### Visual effects (VFX)

**V-01 · VFX · P1: Hit impacts on pathogens are too small**
- Evidence: in `e-kills`, a hit at (640,350) produces a small orange star (~25 px) plus 4 short tick marks. There is no fluid spray, chunk or decal on the enemy.
- Root cause: `world.burst()` uses `PointsMaterial size .135` additive points with life .14–.51 s, uniform and round.
- Fix:
  - Velocity-stretched sprites: a custom ShaderMaterial on the same Points, or instanced quads aligned to velocity.
  - Species ichor colour (`SPECIES_COLORS`) at ×3 HDR for 2 frames.
  - Size 0.06–0.22 random.
  - Gravity 2.4 → 6 for a wet arc.
  - A 0.08 s white emissive flash on the hit enemy mesh (`emissiveIntensity` spike, as already done for attack glow).

**V-02 · VFX · P1: Spore projectile is a flat matte magenta sphere**
- Evidence: in `e-kills`, a solid pink ball (520–555, 298–335) on the spitting spore has no glow, trail or translucency. It looks like a debug gizmo.
- Fix: layer an emissive core (`emissive` 0xff4fb0 × 2.5), a fresnel shell (`onBeforeCompile`: `pow(1-dot(N,V),2.5)` into emissive), and an additive halo sprite at 2.2× radius. Add a 0.4 s trail using `TracerPool.add()` with a pink material and tail 1.5 m.

**V-03 · VFX · P1: Spore and gas clouds read as blurry disc sprites**
- Evidence: in `f-aim` and `g-melee`, lilac soft circles of uniform ~50–70 px (230,200), (300,230), (430,265), (470,210) have identical falloff, no internal detail and hard round silhouettes.
- Fix: replace the radial texture with a 256² canvas fBm (4 octaves, domain warped), thresholded and feathered. Randomise rotation and scale (0.6–1.6×), rotate slowly, and add soft-particle depth fade in the shader using `tDepth`. Reduce opacity to 0.35 so stacks build density.

**V-04 · VFX · P1: Chromatic aberration is too strong at the frame edges**
- Evidence: in `a-spawn` (crop), RGB splits of 3–5 px appear on every bright edge in the bottom-left quadrant (0–240, 430–720), including the floor ripples behind the HUD. `b-lungs-a-spawn` shows a rainbow seam at the top right (1230, 60–160) and on bubble edges. `b-lungs-b-reverse` shows the hanging cilia at the frame edges (0–10, 40–110 and 1110–1135, 20–200) splitting into vivid red, green and blue lines.
- Why it hurts: constant fringing reads as a cheap lens filter or a broken monitor.
- Root cause: `shift = centered * edge * aberration * 40` with `aberration = .0005` gives about 0.005 UV (6 px) at the corners.
- Fix: base `aberration` .0005 → .00012. Use the higher value only as a transient on damage (`this.focus` or a new `hurt` uniform decaying over 0.25 s).

**V-05 · VFX · P2: Specular "comet" streak artifact on the upper vessel**
- Evidence: `a-spawn`, `c-enemies`, `e-kills`: a white curved streak (480–550, 100–200) on a dark tube, the same in every forward view. `f-aim` shows the same at (480–520, 0–60).
- Why it hurts: it reads as a lens flare or rendering bug, it draws the eye to the top of the frame, and it pulls focus from the objective.
- Fix: identify the mesh (likely a vessel tube near a high-intensity point light; `arena-scene.mjs` has `PointLight(0xffb07c, 310, 34)`). Raise its roughness to ≥.55, clamp light intensity on that layer, or limit specular with `specularIntensity: .3` via `MeshPhysicalMaterial`.

**V-06 · VFX · P2: Lung airflow particles are visual noise**
- Evidence: in `b-lungs-a-spawn`, hundreds of thin white diagonal streaks and vertical white hairs (cilia) at 100% brightness are scattered across the frame (e.g. 450–900, 120–380). They read as rain or screen scratches and compete with enemies.
- Fix: halve the count. Colour-match the streaks to the mist (0xe8c7cf), cap alpha at .35, and fade them by distance and with motion. Give cilia the floor palette with tips at 60% brightness, not pure white.

**V-07 · VFX · P2: Bloom is effectively disabled**
- Evidence: the node core spark (`a-spawn` 640,375), the weapon green strip and the rogue-bot red eye (`g-melee` 1190,555) bloom 0–3 px.
- Root cause: `finish.bloom = look.bloom / this.down.length` = .55/6 ≈ .09, so the 6-mip sum is divided again.
- Fix: weight the mips in the upsample, for example `tBase × 1 + tent × .8`, and set `finish.bloom = .35` with `threshold 1.0`. Make every intentional emissive (cores, eyes, LEDs, flashes, tracers) HDR ≥ 3.

### Lighting & grade

**L-01 · Lighting & grade · P0: The artery is a single-hue red frame**
- Evidence: in `a-spawn`, `b-reverse` and `c-enemies`, floor, sky, fog, vessels, RBCs and most enemies sit in hue 350°–10°. Shadows are deep red, not cool. Only the weapon and HUD break the hue.
- Why it hurts: with no hue contrast, depth, materials and gameplay reads collapse. AAA "inside the body" art (e.g. Viscera-style palettes) relies on cool shadow fills, wet speculars and accent colours.
- Fix (all parameters):
  - `LOOKS.artery`: `lift: [0, .006, .016]` (cool shadows), `gain: [1.03, .97, .94]`, `saturation .94 → .88`, `contrast 1.06 → 1.12`.
  - Fill `DirectionalLight 0xb3c9e3` intensity .77 → 1.5, colour → 0x8fb8e8.
  - Fog 0x462524 → 0x3a2228 (less chroma).
  - Mist `[.62,.26,.24]` → `[.50,.24,.26]`.
  - Add a split-tone in `finish`: `color += (1.-luma) * vec3(-.01,.0,.025) * splitTone`.

**L-02 · Lighting & grade · P0: Floor specular blows out to white**
- Evidence: `b-reverse` shows a ~220×120 px pure-white hotspot (380–600, 400–520). `a-spawn` has another at (380–450, 400–450), and `b-lungs-a-spawn` one at (400–440, 420–450). The floor reads as wet plastic or sand, not tissue.
- Fix:
  - Floor material roughness ≥ .5, using a noise roughness map so speculars break into small wet sparkles.
  - Specular anti-aliasing: roughness from normal variance, a `dFdx` / `dFdy` trick in `onBeforeCompile`.
  - Lower `toneMappingExposure` 1.18 → 1.0 and recover midtones with `gain`.
  - Clamp point-light contributions near the floor (lower `PointLight(..., 310, 34)` to ~180).

**L-03 · Lighting & grade · P1: Crushed blacks on dark-albedo assets**
- Evidence: the shellback (`c-enemies` 680–780, 270–390; `g-melee` 650–880, 180–410) renders as RGB ~10,5,15 with only purple speculars. RBC concave faces (`b-reverse` 620–730, 130–210) and the ADS housing (`f-aim`) also go to pure black.
- Fix: hemisphere ground colour 0x5c3c4e → 0x7a5060 at .93 → 1.1. Add wrap lighting (`NdotL*0.5+0.5`) for tissue, RBC and pathogen materials via `onBeforeCompile` for a fake-SSS look. Set a minimum albedo of 0x202020 on enemy materials. Raise `lift` (see L-01).

**L-04 · Lighting & grade · P1: Lungs grade is milky and lacks contrast**
- Evidence: in `b-lungs-a-spawn`, the darkest pixels are ~RGB 90,50,70 and the frame histogram is compressed into the upper midtones. Enemies would have no silhouette here.
- Fix: `LOOKS.lungs`: `mistDensity .014 → .009`, `contrast 1.06 → 1.15`, `lift → [0,0,.006]`. Fog density × .8. Keep the haze only in the distance via `mistReach 45 → 30`.

**L-05 · Lighting & grade · P1: Floor bump reads as topographic wood grain**
- Evidence: in `a-spawn`, `c-enemies` and `g-melee`, the foreground floor ridge (0–720, 430–600) shows concentric, regularly spaced contour lines, like wood grain or a topographic map.
- Fix: in `bio-textures.mjs` / `arena-textures.mjs`, replace the banded noise with domain-warped fBm (`p += .6*fbm(p*1.7)` before sampling), add a cellular (Worley) layer for tissue cells, and halve `bumpScale`.

**L-06 · Lighting & grade · P2: Volumetric shafts in lungs are hard-edged grey cones**
- Evidence: `b-lungs-a-spawn` (200–330, 80–260) and (880–990, 80–260) show flat grey trapezoids with sharp edges.
- Fix: give cone shaft materials a radial fade (`1 - abs(uv.x-.5)*2`)^2, a vertical fade, and a 0.4 noise scroll. Use additive blending at opacity ≤ .12.

### Environment

**E-01 · Environment · P1: A foreground decor chunk intrudes into the view**
- Evidence: `c-enemies`, `d-firing`, `e-kills`, `f-aim`, `g-melee` all show a flat-lit beige lump (540–640, 670–720) at the bottom centre, like a potato on the lens.
- Fix: in `decor-chunks.mjs` / `cullDecor`, hide or fade decor within 1.6 m of the camera and in the bottom-centre view cone. Darken the decor albedo to the floor palette.

**E-02 · Environment · P2: Floor debris reads as tan gravel**
- Evidence: `a-spawn` and `c-enemies` show bright beige flakes (400–620, 400–480) with high albedo, like sand or pebbles on a beach.
- Fix: tint them to 0x8a3a34 and 0x5a2a30 variants at roughness .35, sitting wet. Scale variance and partial burial (offset y −30%).

**E-03 · Environment · P2: Background pillars and vessels are flat**
- Evidence: in `a-spawn`, vertical columns (760–880, 0–330) and horizontal tubes (650–1280, 60–240) are smooth gradient cylinders with no surface detail.
- Fix: apply the tissue normal or bump texture at a large scale, add an emissive capillary map (canvas branching lines with low emissive pulse at the heart rate), and add fresnel rim brightening to separate silhouettes from fog.

**E-04 · Environment · P2: Tissue node gives no visual health state**
- Evidence: `a-spawn`: the "Arterial Core" dome (520–720, 270–420) has a white spark at the centre that the crosshair sits right on. There is no ring, colour or glow tied to 100% health.
- Fix: add a ground decal ring under each node (canvas annulus) with an arc fill equal to health, in the node colour (lime, teal, lilac to match the HUD bars). Shift the emissive to red and pulse it below 40%.

### Enemies

**N-01 · Enemies · P0: Pathogens don't separate from the background**
- Evidence: in `c-enemies`, the crown virus (50–230, 270–420) is red-on-red. The bacillus (340–460, 340–390) is olive on brown-red. The spore (480–600, 220–390) is purple and dark red. None has a rim.
- Fix: add a shared fresnel rim to every pathogen material via `onBeforeCompile`: `emissive += rimColor * pow(1.-saturate(dot(N,V)),3.) * rimStrength` with `rimStrength` 1.2 and a cool `rimColor` (0x9fd8ff) in the artery. Raise it to 2.5 for 80 ms on hit. This is the single most effective readability fix.

**N-02 · Enemies · P1: The shellback is a black spiky ball with no material story**
- Evidence: `c-enemies` (660–780, 270–390), `g-melee` (640–880, 180–410). Spikes are plain cylinders and the body is near-black.
- Fix: thin-film iridescence (`MeshPhysicalMaterial` `iridescence: 1, iridescenceIOR: 1.3`), base 0x2a1f3a, and emissive pores (canvas dots map, 0x7f5cff, intensity 1.5). Taper the spikes (`ConeGeometry` with a rounded tip) and add a bulb at each tip.

**N-03 · Enemies · P1: Crown virus reads as a raspberry**
- Evidence: in `g-melee` (290–590, 130–430), short red bumps cover a red sphere.
- Fix: extend the spike proteins to stalk plus club (cylinder .25 r long + sphere), colour the clubs a contrasting yellow-orange (0xf2a35b), and darken the envelope to 0x5a1a28 so the corona silhouette pops.

**N-04 · Enemies · P2: The rogue bot is a different art style (toy plastic)**
- Evidence: `g-melee` (1100–1280, 430–580): glossy clean white plastic with a red disc eye. It reads as a toy, unlike the wet organic world.
- Fix: add procedural grime (a canvas noise multiply at 25%), streaks of biofilm in the arena colour at the lower half, and an HDR red eye (×5) with a bloom halo plus a small lens-glare sprite. Draw the laser "aim line" as an HDR ribbon.

**N-05 · Enemies · P2: No visible damage state during sustained fire**
- Evidence: between `d-firing` and `e-kills` (30 → 16 rounds) no enemy shows a hit reaction, wound or colour change, and "51 THREATS LEFT" is unchanged.
- Fix: emissive hit flash (N-01), a short scale punch (1.0 → 1.06 → 1.0 over 90 ms), and per-hit wound decals parented to the enemy (reuse `impact-fx` puncture texture).

**N-06 · Enemies · P1: Hovering pathogens have no contact or ground shadow**
- Evidence: in `b-lungs-c-enemies`, the crown virus (50–230, 280–420), spore (480–600, 215–340) and shellback (650–780, 270–380) float above the floor with nothing under them. The same is true in `b-artery-c-enemies`. Depth and distance are hard to judge, and the enemies look composited in.
- Fix: one instanced blob-shadow quad per enemy. Use a canvas radial gradient, `rgba(0,0,0,.55)` falling to 0, multiply blending, at `floorHeight(x,z) + .02`. Scale it by enemy radius and fade it with height (`opacity = .55 * exp(-h/1.5)`). For flyers, add a faint additive species-colour glow pool on the floor as well.

**N-07 · Enemies · P2: Lungs show the readability target the artery should hit**
- Evidence: against the pink haze of `b-lungs-c-enemies`, the crown virus (red), bacillus (ochre) and shell virus (teal) separate clearly. In the artery (`c-enemies`) the same models disappear. This confirms that the problem is the artery's value and hue design (L-01, N-01), not the models.
- Fix: use a lungs-like value separation as the benchmark. Background mid-value ≈ 0.45 luma, enemies ±0.25 away from it, rim on.

### Front end

**F-01 · Front end · P0: Online Co-op screen is an empty box with developer copy**
- Evidence: `20-coop`: a 900×595 bordered panel (190–1090, 105–700) containing one line, "Open the multiplayer server's game URL to create or join a room."
- Fix: design an empty state. Use a procedural illustration (two suit silhouettes via the canvas icon set, or a live `coop-lobby-bay` 3D render), a headline "CO-OP REQUIRES A HOSTED SERVER", 2-line explanation, and a secondary "Copy setup instructions" button. Shrink the panel to its content and centre it vertically.

**F-02 · Front end · P0: The menu style is SaaS cards, not game UI**
- Evidence: `10-title` uses 6 bordered rectangles (40–590, 461–632) with 1-px borders, thin 1.5-px line icons and 17-px Inter Medium labels, plus a lime CTA with a sentence-case subtitle. `14`–`19` use the same card language, a mix of sentence case and caps ("Build stats" vs "RESET CARBINE"; "Controls" tabs vs "WEAPONS" tabs).
- Fix:
  - Menu items become borderless rows. The label is Barlow Condensed 26 px caps with +0.04 em tracking. Focus and hover show a 4-px lime bar on the left, a 12-px slide-in, and a gradient sweep `rgba(200,247,148,.12)→0`.
  - Use the clipped-corner `hudPanel()` shape for all panels, so front end and HUD share one visual language.
  - One case rule: all buttons and tabs in caps, body text in sentence case.
  - Icons at 2-px stroke and 20 px.

**F-03 · Front end · P1: Loading screen hides its key art and has a 2-px progress bar**
- Evidence: in `load-12`, `load-24` and `00-intro-6000`, the art (a nano-soldier on RBCs) is at about 10% visibility. `render()` uses alpha .17 for non-menu scenes plus a `#0b131be6` gradient. 720×350 px of the left-centre is dead space, and the progress bar is 2 px (40–690, 661).
- Fix: art alpha .17 → .6, with the gradient confined to the left 45% (`stop .45 → #0b131b00`). Bar 6 px with a glowing head (radial gradient 12 px) and 10% segment notches. Add a slow ambient element: drifting procedural RBC silhouettes or a scanning line across the art. Fix the headline wrap to "SMALL SOLDIER." / "BIG PROBLEMS." by setting max-width to fit.

**F-04 · Front end · P1: The "Skip briefing" prompt is unreadable over video**
- Evidence: `11-briefing`, `12-briefing-loadout`: "→ Skip briefing", 13-px white, at (1085–1205, 682) over the doctor's white lab coat, with about 1.2:1 contrast. There are no subtitles and no frame.
- Fix: put the prompt in a dark pill (`rgba(0,0,0,.6)`, 8-px radius) with a keycap glyph "[ESC] SKIP" and a hold-to-skip radial ring. Add 2.39:1 letterbox bars (88 px each at 720p) with subtitles centred in the lower bar at 18 px. Add a lower-third ID card ("DR. … · CHIEF IMMUNOLOGIST") with an animated lime rule.

**F-05 · Front end · P1: Disease Guide specimen viewport is mostly empty, and text is clipped**
- Evidence: in `17-guide`, the specimen pane (330–805, 155–553) holds a ~230×140 px model on flat black: no floor, backlight or scale reference. The right column cuts "ENCOUNTERED IN" mid-glyph at y=680 with no fade. "Provoke" is a full-width plain box that looks like a text input.
- Fix: frame the model to fill 65% of the pane, add a circular floor-glow decal and a cool rim light, and add a slow turntable. Add a 24-px gradient fade mask at the bottom of scroll panes. Render "Provoke" as an accent button with an icon, centred under the viewport at auto width.

**F-06 · Front end · P1: Armory stat deltas are prose**
- Evidence: in `14-armory` / `15-gunsmith`, attachment cards list "+5 damage +7 critical −0.01° aimed spread −0.1° hip spread −88 RPM fire rate" as one wrapped sentence at 13 px. The stat tiles (DAMAGE 23, CRITICAL 42, 508 RPM) have no bars.
- Fix: horizontal stat bars in the tiles (6-px track, fill = value / max). On hover over an attachment, overlay green or red delta segments on the bars, and show deltas as coloured chips (`+5 DMG` green, `−88 RPM` red).

**F-07 · Front end · P2: Attachment thumbnails are unreadable**
- Evidence: `15-gunsmith` (770–835, 282–320, 380–415, 497–533): three near-identical 64×36 dark renders of the whole gun.
- Fix: render only the attachment, orthographic, lit, on a lighter `#1c2a30` background, at 96×56. Highlight the attachment in lime on a ghosted gun silhouette.

**F-08 · Front end · P2: Armory preview polish**
- Evidence: a stray 24×2 lime dash at the top-left of the preview (68,187), also in `17-guide` (342,167). In `16-customize`, the equipped checkmark overlaps the "Factory Ivory" swatch (966,298). Swatches are 24 px and the right panel is 70% empty. "14-armory" opens on the Gunsmith tab, not Weapons.
- Fix: remove or replace the dash with a proper "LIVE" tag. Make swatches 48×48 with the check drawn inside a corner badge. Show a large finish preview (material ball) in the empty area. Make Weapons the default tab.

**F-09 · Front end · P2: Field Manual bindings are plain text**
- Evidence: `18-manual`: "Mouse Arrow keys", "Left click Enter", "W A S D", right-aligned plain bold text with no separation between alternatives.
- Fix: draw keycaps for each binding (`roundRect`, 1-px `#ffffff40` border, 2-px bottom shadow, mono 11 px, min-width 22 px), mouse-button glyphs for clicks (canvas path), and a muted "/" between alternatives.

**F-10 · Front end · P2: Settings toggles and values are inconsistent**
- Evidence: in `19-settings`, toggles are full-width buttons ("INVERT VERTICAL LOOK: OFF", "ABILITY HINTS: ON" with a checkmark). Slider values are in a monospace face (1.00×, 100%) that matches nothing else. The 2-px green scrollbars look like stray strokes. The "SOUND ON" footer button duplicates Master volume.
- Fix: a switch component (36×18 pill, knob 14 px, lime when on). Values in tabular Inter or Barlow. Scrollbars 4 px with a track. Remove "SOUND ON" or label it "MUTE ALL".

**F-11 · Front end · P2: Low-contrast intro tagline**
- Evidence: `00-intro-2000`: "100% VIBE CODED · 0% UNIT TESTED" at about RGB 50,55,60 on RGB 10,10,12, roughly 1.4:1.
- Fix: raise to `#8a9096` (about 6:1) and fade it in 400 ms after the logo.

**F-12 · Front end · P2: Title operator-record panel collides with the art**
- Evidence: `10-title`: the panel (910–1240, 468–688) covers the key art's rifle silhouette (930–1240, 390–720). "BEST SCORE —" shows an em dash, and the panel uses a third type style.
- Fix: move it to a compact strip under the menu, or to the top right below the icons. Show "BEST SCORE  NO RUNS YET" in muted caps.

---

## 3. Recommended sprint scope

These are ordered by visual payoff per engineering effort. All are procedural or parameter changes.

| # | ID | Item | Effort |
|---|----|------|--------|
| 1 | W-01 | Fix muzzle flash compositing (custom alpha blending) and HDR colour | S |
| 2 | W-02 | HDR tracers with minimum pixel width and longer tail | S |
| 3 | H-01 | Edge-marker line-height bug, one-line label and bearing chevron | S |
| 4 | H-02 / H-03 | Score string and weapon-slot chips (remove "SCORE 0 0 kills" and "1 2") | S |
| 5 | N-01 | Shared fresnel rim and hit-flash on all pathogen materials | S–M |
| 6 | L-01 | Artery grade: cool lift, stronger blue fill, less red fog and mist, more contrast | S |
| 7 | L-02 | Floor roughness, specular AA, exposure 1.18 → 1.0 (kill white hotspots) | S |
| 8 | V-04 + V-07 | Chromatic aberration .0005 → .00012; fix the bloom division so emissives glow | S |
| 9 | W-03 | ADS: single concentric reticle, model pushed forward, FOV zoom, rim light | M |
| 10 | W-04 | Per-arena weapon lighting (hemisphere, bounce, env tint) | S |
| 11 | H-06 | Crosshair white with outline, centre dot, red on enemy | S |
| 12 | W-05 + H-04 | Smaller, lower viewmodel; ammo readout with reserve and round ticks, lighter panel | S–M |
| 13 | V-01 + V-02 | Velocity-stretched species-coloured hit sprays; glowing spore projectile with trail | M |
| 14 | L-03 | Wrap lighting and lifted ground hemisphere (no crushed shellback or RBC blacks) | S |
| 15 | E-01 + N-06 | Cull or fade decor near the camera; blob contact shadows under hovering pathogens | S |
| 16 | H-05 + H-07 | Ability tiles with procedural icons and cooldown sweeps; hide mute and pause in combat | M |
| 17 | F-01 | Co-op empty state | S |
| 18 | F-03 + F-04 | Loading-screen art visibility and progress bar; skip-prompt pill and letterbox on briefing | S |
| 19 | F-02 | Menu restyle: borderless condensed caps rows, lime focus bar, clipped-corner panels everywhere | M |
| 20 | L-04 + V-06 | Lungs contrast pass and toned-down airflow particles | S |

Suggested sequencing: items 1–8 are about a 2-day batch of shader, parameter and string fixes, and on their own they change the first-impression read of combat. Items 9–16 are the weapon-feel and readability pass. Items 17–20 are front-end polish.
