# Immune Protocol

A first-person nano-soldier defense game set inside a living artery. Survive five escalating waves of viruses, bacilli, and spores while protecting the tissue node. Repair the node between waves and keep the host alive.

## Run locally

From this directory, run `npm run dev` and open [http://127.0.0.1:8017](http://127.0.0.1:8017) in a browser with WebGL 2. The server uses Python 3. No npm install is needed. The complete static game lives in `dist/`.

## Controls

| Action | Control |
| --- | --- |
| Move | WASD |
| Look | Mouse or arrow keys |
| Fire | Left click or Space |
| Aim | Hold right click |
| Sprint | Shift |
| Reload | R |
| Repair | Hold E next to the tissue node |
| Pause | Esc or P |

When mouse capture is unavailable, drag the view to look. On touchscreens, move with the joystick, drag to look, and use the action buttons.

## Artwork

The built-in image generator produced the title artwork and tissue texture.

- `dist/assets/hero.webp` depicts a photoreal artery at the scale of a nano-soldier, with backlit spiked pathogens, suspended blood cells, and a first-person carbine. The attached reference set the visual direction.
- `dist/assets/tissue.webp` depicts close-packed burgundy collagen, micropores, and fine capillaries for the 3D chamber surfaces.
- `dist/carbine.mjs` builds the in-game carbine and armored gloves as a 3D model with physically based materials. The model animates in the player’s camera as they move, aim, fire, and reload.
