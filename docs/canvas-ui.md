# Canvas game interface

All player-facing screens draw through one 2D canvas interface: studio intro,
initial loading and retry, title menu, campaign confirmation, deployment, armory,
pathogen guide, field manual, settings, co-op entry and lab, combat, pause,
extraction, and mission reports and rewards. The 3D world remains in its existing
WebGL canvas underneath. No additional WebGL context is created for the UI.

## Boundaries

| Module | Responsibility |
| --- | --- |
| `ui-core.mjs` | Logical coordinates, wrapping, flow and grid layout, clipping, scrolling bounds, directional focus, ranges, and independent pointer ownership. No browser globals. |
| `ui-theme.mjs` | Shared palette, body/display/technical type roles and line-height metrics. |
| `ui-screens.mjs` | Screen definitions and combat layout. Consumes plain models, viewport size and safe areas; emits draw commands and hit regions. No HTML or CSS selectors. |
| `ui-renderer.mjs` | Canvas 2D painting, text measurement, pictures, controls, HUD, scope and boss footprints. Resources are resolved by key. |
| `ui-browser.mjs` | Browser input, native text editing, viewport and keyboard changes, semantic accessibility mirror, controller routing, and presentation loop. |
| `ui-bindings.mjs` | Compatibility adapter for existing browser controllers. Converts their current semantic values to models and invokes their actions. It does not copy HTML layout or rasterize a DOM tree. |
| `ui-media.mjs` | Captures live WebGL previews immediately after their render, before the default drawing buffer is discarded. Uses a reusable 2D surface held in a weak map. |
| `ui.css` | Browser host isolation, safe-area probe, hidden compatibility controls, accessibility layer and platform text editor. |

Existing browser screen controllers and their HTML remain as a nonvisual
compatibility backend. This preserves campaign progress, save formats, weapon
equipping, difficulty, co-op messages, and screen close/cancel behavior. Focus and
modal ownership belong to the canvas UI, so these controls cannot open native
select lists or scroll the page during normal game input. A semantic mirror
provides buttons, ranges, selected states and readable content for assistive
technology. Callsign, room code and invite-link editing use one intentional native
text field to retain mobile keyboards and clipboard access.

## Porting

The core and screen definitions can be reused in another JavaScript host. A
packaged web build reuses the browser host as well. For a different native engine,
implement the resource resolver, drawing/text measurement, platform text entry,
accessibility, and input callbacks; supply plain screen models and action IDs in
place of `BrowserUiBindings`. HTML and CSS do not define the new screen geometry.
Moving to Unity, Godot or another language still requires a host/renderer adapter;
this change does not automatically convert the Three.js game to that engine.

## Interaction and memory

- Touch targets are at least 44 logical pixels; fire is 64 and movement is 92.
- Pointer ownership lets movement, aiming, firing and repair run independently.
  Cancel, lost capture, blur, hidden documents and screen transitions release
  held controls. Two pointers on one held action release it only after both end.
- Scrolling uses clipped game panes with touch slop and deceleration. It does not
  scroll the browser document. Selectors and build stats use modal game panels
  that block both hit testing and scrolling on the underlying screen.
- Keyboard arrows, Tab, Enter, Escape and paging keys use the same focus/action
  system as controller navigation, confirm and back. Controller repeats have an
  initial delay and an interval. Settings and armory have useful initial focus.
- Changing a mission, enemy, armory mode or part resets its content scroll.
  Portrait mission/enemy selectors and armory part selectors remain visible.
- Desktop workspaces separate mission navigation, visual briefing and setup;
  the gallery separates specimens from field intelligence. Compact screens use
  persistent content tabs. A new mission returns to Briefing, and switching an
  armory mode returns to Configure. Co-op has separate portrait Squad/Suit tabs.
- Reports place field-upgrade choices and extraction risk beside the key metrics;
  individual node statistics remain in Full mission details. Confirmations and
  recovery use compact centered panels. The safe checkpoint action gets initial
  keyboard focus in a destructive campaign confirmation.
- Combat presentation runs after HUD updates in the game frame, keeping ammo,
  aim, hit feedback and boss footprints in step with the rendered world.
- The browser host accounts for safe areas and `visualViewport` resizing, and
  repositions active text entry when the software keyboard changes the viewport.
- Mobile UI pixel density is capped at 2 and live preview copies at 900 pixels
  on their longest side. Desktop retains host pixel density and preview size.
  UI does not allocate or upload a full-screen WebGL texture each frame. The
  existing mobile-only model/texture loading policy is unchanged.
- A UI painting failure stops held input and shows a reload screen instead of
  leaving the player with an invisible or frozen interface.

`translate="no"`, page scroll locking and iOS selection/callout suppression apply
to the game surface. Browser address bars and OS controls remain under browser/OS
control; the intentional text editor retains normal editing behavior.

## Visual system

The interface uses dark neutral surfaces, white display headings, restrained
medical-green selection/primary states, and a separate warm destructive state.
Inter handles readable body copy and controls, Barlow Condensed handles display
titles and large metrics, and IBM Plex Mono handles technical metadata. Layout
measurement uses the same font roles, weights and line heights as painting.
The Inter variable font is bundled locally with its SIL OFL license in `vendor/`;
the game does not depend on a font CDN. See the [Inter project](https://github.com/rsms/inter).
Vector control icons replace platform-dependent text glyphs. Preview cameras use
the canvas stage dimensions, rather than the old hidden HTML aspect ratio.

The UX comparison used Call of Duty's category/tab/action hierarchy and aligned
control rows as reference, with Immune Protocol's own assets and identity. See
[the reference settings screenshots](https://esports.gg/news/call-of-duty/how-to-change-your-hud-in-black-ops-6/)
and the [official controls/settings guide](https://www.callofduty.com/guides/blackops6/training/call-of-duty-guides-black-ops-6-multiplayer-training-controls).

## Verification

Run `npm test` and `npm run check`. UI tests cover wrapping, clipping and hit
order, scroll clamping after resize, ranges, directional focus and controller
repeats, modal isolation, cancellation and simultaneous pointers, desktop pixel
density, safe areas, and combat/menu geometry at 393×852, 852×393, 667×375,
568×320 and 1280×720.

Run `npm run profile` and open `/__ui?screen=menu&nointro`. Supported fixtures:
`menu`, `settings`, `manual`, `guide`, `achievements`, `armory`, `deployment`, `confirm`, `coop`,
`play`, `pause`, `result`, `loss`, `extraction`, `loading`, `failure`, `ui-failure`, and `intro`.
These are local performance-server routes, not production cheats. Fixtures use
the real controllers and simulation, and restore local settings when leaving.
The `ui-failure` fixture intentionally emits one console error. Use `/__hud` for
frozen laser, boss, organ, airway, gastric, junction and training states.

Browser checks exercised title navigation, settings values and selectors,
armory mode/part selection, rotating enemy previews, scrolling and orientation,
reports and upgrade carry-over, firing and pause, stacked settings/manual,
extraction and retry, intro skip, and recovery. Two local clients created/joined a
room, changed suits, readied and deployed. These are desktop browser and phone
viewport checks; physical iPhone touch/keyboard, VoiceOver/TalkBack and controller
hardware still need device validation.
