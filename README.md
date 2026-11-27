# Immune Protocol

A browser FPS about a nano-soldier injected into a patient. Defend two or three tissue nodes in each of ten missions. Bring an auto-turret to cover one approach while you defend the others, or a medic drone that follows you and slowly mends suits and tissue. The campaign starts in the bloodstream, then moves through the lungs, stomach, small intestine, colon, a lymph node, the inner ear, and the brain.

[Play on GitHub Pages](https://corycowgill.github.io/ImmuneProtocol/) · [Play online co-op](https://immune-protocol-coop.onrender.com/) · [Watch the demo](https://corycowgill.github.io/ImmuneProtocol/demo/)

## Features

- **A ten-mission campaign** through the body, each with its own organ hazard, raised ground and a boss to finish it: from the Thrombus Titan in the artery to the Mega Virus in the brain. Each wave is a checkpoint.
- **Enemy soldiers.** Nanonauts, human operators in red and yellow biosuits fighting for the nanobots, take cover, peek out to fire carbine bursts, strafe, dodge your aim, reload behind scenery and push a wounded suit as a fireteam. Built from a TRELLIS.2 scan on a learned Make-It-Animatable skeleton with fingers, and motion-captured with NVIDIA's Kimodo. See [the Nanonaut](docs/nanonaut.md).
- **Swarms that think.** Pathogens see, hear, remember and coordinate, and waves mix six encounter patterns you read from the pathogens themselves, not from on-screen labels. Brood nests and antibody caches pull you away from your nodes.
- **Five weapons and a nano companion to build.** Carry any two of the carbine, sniper rifle, shotgun, rocket launcher and pistol, plus an auto-turret or a medic drone. Fit parts in the Armory's gunsmith bench and dress them, and your tissue sealer, in finishes, skins, decals, stickers and charms.
- **Suit abilities:** dash with a perfect-dodge window, jump, bash, antibody grenades and stun charges.
- **Endless mode:** hold one arena against waves that never stop, each bigger, faster and tougher than the last, with the boss returning every fifth wave.
- **Easy, Medium and Hard**, plus Free Mode and Mega Virus practice.
- **Online co-op** for two or three players, with four suits and a shrinking-machine lobby.
- **56 achievements** with baked artwork and cosmetic rewards, and separate **operator profiles** for players sharing one browser.
- **Keyboard and mouse, Xbox controller and touch**, with rebindable controls and accessibility options.
- **Seven languages**: English, Spanish, German, French, Chinese (Simplified and Traditional) and Hindi, chosen per operator.

## Guides

- **[Player guide](docs/player-guide.md)**: modes, missions, bosses, weapons, controls, co-op, achievements and settings.
- **[Development guide](docs/development.md)**: running locally, tests, debug pages, architecture, the co-op server, asset pipelines and publishing.

## Quick start

You'll need Node.js with npm, Python 3 on your `PATH` as `python`, and a browser that supports WebGL 2. From the repository root:

```sh
npm run dev
```

Open [http://127.0.0.1:8017](http://127.0.0.1:8017). There's no dependency install or build step: the command serves `dist/` as static files. Run `npm run check` for a syntax check and `npm test` for the test suites. For online co-op, testing and everything else, see the [development guide](docs/development.md).

## Controls

| Action | Keyboard and mouse | Xbox controller |
| --- | --- | --- |
| Move | WASD | Left stick |
| Look | Mouse or arrow keys | Right stick |
| Fire | Left click or Enter | Hold RT |
| Aim | Hold right click | Hold LT |
| Jump | Space | A |
| Dash | C | B |
| Sprint | Shift | Click the left stick |
| Reload | R | X |
| Repair | Hold E | Hold LB |
| Deploy or move the turret; station or recall the drone | Q (hold to drag the turret) | RB |
| Switch weapon | 1 / 2 or mouse wheel | Y |
| Pause | Esc or P | Menu ☰ |

Bash, grenades, stun charges and touch controls are covered in the [player guide](docs/player-guide.md#controls).
