// Reactions to what happened in the field each step: sounds (panned toward their source),
// centre-screen announcements, hit and damage feedback, and progress that is saved, such as
// finishing training. The simulation only reports events; this decides what the player sees
// and hears.
import { session } from './session.mjs';
import { byId, isTouch, pad } from './dom.mjs';
import { tutorialKey, writeSetting } from './settings-store.mjs';
import { hitMarker, branches, nodeHitUntil } from './hud.mjs';
import { padActionKey } from './keybinds.mjs';
import { achievements } from './achievement-system.mjs';
import { LEVEL_BOSSES } from './level-bosses.mjs';

export const alertBox = byId('game-alert');

export function announce(title, detail = '', duration = 2.45) {
  const titleNode = document.createTextNode(title);
  const subtitle = document.createElement('small');
  subtitle.textContent = detail;
  alertBox.replaceChildren(titleNode);
  if (detail) alertBox.append(subtitle);
  session.announcementTimer = duration;
}

// The last step whose events reached the achievement tracker, so a step re-applied after a
// dialog (extraction) is not counted twice.
let observedStep = null;

export function applyEvents() {
  const step = session.sim.events.length ? session.sim.events[0] : null;
  if (step && step !== observedStep) {
    observedStep = step;
    const localId = session.sim.player?.id;
    achievements.observe(session.sim.events, {
      isLocal: event => !session.onlineRun || event.playerId == null || event.playerId === localId,
      weapon: session.sim.weaponLoadout?.weapon ?? session.sim.weapon?.weapon,
      clock: session.sim.clock,
    });
  }
  for (const event of session.sim.events) {
    const teammate = session.onlineRun && event.playerId && event.playerId !== session.sim.player.id;
    session.haptics?.event(event, { player: session.sim.player, teammate: !!teammate });
    if (teammate) {
      if (event.type === 'shot') {
        const actor = session.sim.players.find(player => player.id === event.playerId);
        if (actor) {
          const dx = actor.x - session.sim.player.x;
          const dz = actor.z - session.sim.player.z;
          const distance = Math.hypot(dx, dz);
          const pan = (dx * Math.cos(session.sim.player.yaw) - dz * Math.sin(session.sim.player.yaw)) / Math.max(1, distance);
          session.audio.play({ type: 'shot', teammate: true, distance, pan, weapon: event.weapon, pellet: event.pellet, blast: event.blast });
        }
        continue;
      }
      if (event.type === 'kill' && Number.isFinite(event.x)) {
        // A teammate's kill skips the confirmation tick but the pathogen still dies audibly.
        const { x, z, yaw } = session.sim.player;
        const dx = event.x - x, dz = event.z - z, distance = Math.hypot(dx, dz);
        session.audio.play({ ...event, teammate: true, distance, pan: (dx * Math.cos(yaw) - dz * Math.sin(yaw)) / Math.max(1, distance) });
        continue;
      }
      if (['dry', 'reload', 'hit', 'kill', 'repairStart', 'repairStop', 'swap'].includes(event.type) ||
        (event.type === 'damage' && event.target === 'player')) continue;
    }
    if (event.type === 'checkpoint' && event.stage === 'restored' && session.onlineRun) {
      announce(event.airway ? 'THE AIRWAY' : 'WAVE ' + pad(event.wave), 'SQUAD RESUMED FROM CHECKPOINT', 3.2);
    }
    if (event.type === 'outro') {
      // The countdown banner takes over the centre of the screen.
      session.announcementTimer = 0;
      alertBox.replaceChildren();
    }
    if (event.type === 'suit' && !teammate) {
      if (event.stage === 'down') announce('SUIT DOWN', 'YOUR TEAMMATE CAN FINISH THE WAVE', 3.2);
      if (event.stage === 'respawn') announce('SUIT RESTORED', 'READY FOR THE NEXT WAVE', 2.5);
    }
    if (event.type === 'tutorial' && event.stage === 'complete') {
      session.trainingComplete = true;
      writeSetting(tutorialKey, true);
      const goal = session.sim.drone ? 'TO STATION YOUR MEDIC DRONE' : 'TO DEPLOY YOUR TURRET';
      announce(session.sim.nodes.length > 2 ? 'DEFEND ALL THREE TISSUE NODES' : 'DEFEND BOTH TISSUE NODES', session.usingGamepad ? 'PRESS ' + padActionKey('turret').toUpperCase() + ' ' + goal
        : isTouch ? (session.sim.drone ? 'TAP STATION TO HOLD YOUR DRONE' : 'TAP TURRET TO DEPLOY') : 'PRESS Q ' + goal, 3.8);
      session.audio.play({ type: 'wave', stage: 'start' });
    }
    if (['branch', 'valve', 'enemyAttack', 'damage', 'hit', 'kill', 'turret', 'drone', 'organ', 'guard', 'boss', 'levelBoss', 'airway', 'gastric', 'explosion', 'stun', 'throw', 'melee', 'dash', 'jump', 'land', 'dodge'].includes(event.type) && Number.isFinite(event.x)) {
      const { x, z, yaw } = session.sim.player;
      const dx = event.x - x;
      const dz = event.z - z;
      const distance = Math.hypot(dx, dz);
      const pan = (dx * Math.cos(yaw) - dz * Math.sin(yaw)) / Math.max(1, distance);
      session.audio.play({ ...event, pan, distance, teammate: !!teammate });
    } else if (event.type !== 'mission') session.audio.play(event);
    if (event.type === 'boss') {
      if (event.stage === 'defeated') {
        announce('MEGA VIRUS DOWN', 'CLEAR SURVIVING PATHOGENS', 2.5);
      }
    }
    if (event.type === 'airway') {
      if (event.stage === 'start') announce('AIRWAY OBSTRUCTION', 'MOVE TO EACH BRONCHUS AND HOLD REPAIR', 3);
      if (event.stage === 'opened') announce(event.name.toUpperCase() + ' OPEN', 'WATCH THE TISSUE INTEGRITY', 1.8);
      if (event.stage === 'blocked') announce(event.name.toUpperCase() + ' BLOCKED', 'REOPEN IT TO RESTART THE BREATH', 2.6);
      if (event.stage === 'hold') announce('BOTH BRONCHI OPEN', 'HOLD THROUGH ONE FULL BREATH', 2.8);
      if (event.stage === 'secured') announce('AIRFLOW RESTORED', session.sim.enemies.length ? 'CLEAR SURVIVING PATHOGENS' : '', 2.4);
    }
    if (event.type === 'gastric') {
      if (event.stage === 'start') announce('CLOSE THE INTAKE', 'HOLD REPAIR AT THE WEST BANK', 2.8);
      if (event.stage === 'intake-closed') announce('INTAKE CLOSED', 'ACID REROUTED · HEAD TO THE DRAIN', 2.7);
      if (event.stage === 'draining') announce('DRAIN OPEN', 'WATCH THE LOWER PASSAGE', 2.5);
    }
    if (event.type === 'levelBoss') {
      if (event.stage === 'arrive') {
        session.audio.play({ type: 'boss', stage: 'phase', x: event.x, z: event.z });
        announce(event.name.toUpperCase(), event.hint, 4.2);
      }
      if (event.stage === 'defeated') {
        session.audio.play({ type: 'boss', stage: 'defeated', x: event.x, z: event.z });
        announce(event.name.toUpperCase() + ' DOWN', session.sim.enemies.length ? 'CLEAR WHAT IS LEFT' : '+2,500 SCORE', 3);
      }
      if (event.stage === 'ability' && ['charge', 'slam', 'pull', 'pulse-warning', 'burrow', 'volley'].includes(event.ability)) {
        session.audio.play({ type: 'boss', stage: 'warning', x: event.x, z: event.z });
      }
    }
    if (event.type === 'encounter') {
      if (event.stage === 'warning') {
        session.audio.play({ type: 'wave', stage: 'start' });
      }
      if (event.stage === 'turn') session.audio.play({ type: 'wave', stage: 'start' });
    }
    if (event.type === 'nest') {
      if (event.stage === 'spawn') {
        session.audio.play({ type: 'wave', stage: 'start' });
        announce('BROOD NEST DETECTED', 'CROSS THE ARENA AND DESTROY IT BEFORE IT HATCHES MORE', 3.4);
      }
      if (event.stage === 'destroyed') announce('BROOD NEST DESTROYED', '+600 SCORE', 2);
    }
    if (event.type === 'cache') {
      if (event.stage === 'spawn') announce('ANTIBODY CACHE INBOUND', 'REACH IT FOR SUIT REPAIR AND A FULL MAGAZINE', 3);
      if (event.stage === 'collect') {
        session.audio.play({ type: 'repair', complete: true });
        const collector = session.onlineRun ? session.sim.players?.find(player => player.id === event.playerId) : null;
        announce('ANTIBODY CACHE SECURED', collector && collector.id !== session.sim.player.id ? 'COLLECTED BY ' + (collector.name || 'TEAMMATE').toUpperCase() : 'SUIT PATCHED · MAGAZINE FULL · +1 GRENADE · +250', 2.2);
      }
    }
    if (event.type === 'turret') {
      if (event.stage === 'deployed') announce('AUTO-TURRET ONLINE', 'COVERING THIS POSITION', 1.8);
      if (event.stage === 'redeployed' || event.stage === 'moved') announce('AUTO-TURRET REPOSITIONED', 'COVERING THE NEW POSITION', 1.5);
      if (event.stage === 'invalid') announce('PLACEMENT BLOCKED', 'FACE CLEAR GROUND AND TRY AGAIN', 1.8);
    }
    // Only your own drone's orders are announced.
    if (event.type === 'drone' && (event.playerId == null || event.playerId === session.sim.player?.id)) {
      if (event.stage === 'stationed') announce('MEDIC DRONE STATIONED', 'MENDING AROUND THIS SPOT', 1.6);
      if (event.stage === 'following') announce('MEDIC DRONE RECALLED', 'FOLLOWING YOUR SUIT', 1.4);
    }
    if (event.type === 'surge' && event.stage === 'arrival') {
      announce(event.threat.toUpperCase(), 'INBOUND TO ' + event.nodeName.toUpperCase(), 1.65);
    }
    if (event.type === 'guard' && event.stage === 'block' && event.source !== 'turret' && session.sim.clock >= session.guardHintUntil) {
      announce('FRONTAL SHELL', 'FLANK THE SHELLBACK TO HIT ITS EXPOSED TISSUE', 1.8);
      session.guardHintUntil = session.sim.clock + 4;
    }
    if (event.type === 'gash') {
      const lane = branches[event.branch].name;
      if (event.stage === 'open') announce(lane + ' GASH OPEN', 'SEAL IT TO STOP TISSUE LOSS', 2.5);
      else if (event.stage === 'closed') {
        announce(lane + ' GASH SEALED', session.sim.settling ? 'PREPARE FOR EXTRACTION' : 'TISSUE LOSS STOPPED', 2.2);
        if (session.sim.nodes.some(node => node.id === event.nodeId && node.health < 100)) session.audio.play({ type: 'repair', complete: true });
      }
    }
    if (event.type === 'kill' && event.enemyType === 'colony' && session.sim.tissue < 100) {
      announce('COLONY NEUTRALIZED', 'CLEAR THE FLANK AND RESTORE BOTH NODES', 3);
    }
    if (event.type === 'shot' && event.hit) {
      session.hitTimer = 0.19;
      hitMarker.classList.toggle('critical', Boolean(event.crit));
    }
    if (event.type === 'kill' && event.source === 'player' && (event.playerId == null || event.playerId === session.sim.player.id)) {
      session.killTimer = 0.34;
    }
    if (event.type === 'damage' && event.target === 'player' && (event.playerId == null || event.playerId === session.sim.player.id)) {
      session.damageTimer = 0.46;
      // Where the hit came from, for the directional indicator; it fades over a second.
      if (Number.isFinite(event.x) && Number.isFinite(event.z)) session.damageFrom = { x: event.x, z: event.z, remaining: 1.1 };
    }
    if (event.type === 'damage' && event.target === 'tissue') {
      if (event.nodeId) nodeHitUntil.set(event.nodeId, session.sim.clock + .9);
      if (session.restoredNode?.id === event.nodeId) session.restoredNode = null;
    }
    if (event.type === 'repair' && event.complete && event.nodeId) {
      session.restoredNode = { id: event.nodeId, until: session.sim.clock + 2.4 };
      if (session.sim.settling) {
        session.announcementTimer = 0;
        alertBox.replaceChildren();
      }
    }
    if (event.type === 'wave') {
      if (event.stage === 'start') {
        const pattern = session.sim.junctionWave;
        const lane = pattern && branches[pattern.lane]?.name;
        const support = session.sim.events.find(item => item.type === 'junctionSupply')?.choice;
        let detail = lane ? lane + ' INLET' : '';
        if (session.sim.boss) detail = 'WATCH FOR THE PULSING CORE';
        else if (session.sim.overtime) detail = 'TEAL BREACH · AMBER SPORE PRESSURE';
        else if (support === 'ammo') detail = 'MAGAZINES LOADED';
        else if (support === 'turret') detail = 'TURRET IN POSITION';
        else if (support) detail = branches[support].name + ' INLET REINFORCED';
        if (session.sim.endless) {
          const mission = session.sim.missions[event.wave - 1];
          const boss = mission?.endlessBoss && LEVEL_BOSSES[session.sim.area];
          announce('WAVE ' + pad(event.wave), boss ? boss.name.toUpperCase() + ' INCOMING'
            : (mission?.species.length ?? 0) + ' PATHOGENS INBOUND');
        } else announce(session.sim.boss ? 'MEGA VIRUS' : pattern ? pattern.name.toUpperCase() : session.sim.organWave?.toUpperCase() ?? 'WAVE ' + pad(event.wave), detail);
      } else if (session.sim.settling) {
        announce('INLETS CLEAR', session.sim.gash ? 'SEAL THE GASH TO EXTRACT' : 'REPAIR TISSUE BEFORE EXTRACTION', 2.8);
      } else if (event.wave < session.sim.waves && session.sim.gastric?.stage !== 'intake') {
        announce('WAVE CONTAINED', session.sim.junctionForecast ? 'CHOOSE SUPPORT FOR THE NEXT WAVE' : 'RELOAD AND REPAIR TISSUE', 3);
      }
    }
  }
}
