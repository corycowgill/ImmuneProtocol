import * as THREE from './vendor/three.module.js';
import { createTeammate } from './teammate.mjs';
import { COOP_MAX_PLAYERS } from './coop-protocol.mjs';

export function createSquadView(mask, createView = createTeammate) {
  const root = new THREE.Group();
  const views = Array.from({ length: COOP_MAX_PLAYERS - 1 }, () => createView(mask));
  for (const view of views) root.add(view.root);
  return {
    root,
    update(players, localId, floorHeight, dt, reduceMotion) {
      const teammates = (players ?? []).filter(player => player.id !== localId);
      views.forEach((view, index) => {
        const player = teammates[index];
        view.update(player, player ? floorHeight(player.x, player.z) : 0, dt, reduceMotion);
      });
    },
    fire(playerId, reduceMotion, position) {
      return views.some(view => view.fire(playerId, reduceMotion, position));
    },
    hide() { for (const view of views) view.hide(); },
  };
}
