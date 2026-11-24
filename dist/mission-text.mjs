// Mission names, briefings and campaign order, for menus, the HUD and reports.
import { ORGAN_MISSIONS } from './organs.mjs';
import { CAMPAIGN_AREAS } from './coop-protocol.mjs';

export const campaignAreas = CAMPAIGN_AREAS;

export const missions = {
  artery: { name: 'Arterial Junction', briefing: 'Defend the core, lateral branch and venous wall through five waves in the bloodstream.' },
  junction: { name: 'Capillary Junction', briefing: 'Read the attack forecast and defend both inlets.' },
  heart: { name: 'Heart Valve', briefing: 'Four valves open in turn. Sprint between them, shoot the colonies through each opening and seal the wounds while they close.' },
  ...ORGAN_MISSIONS,
};

export const missionName = area => missions[area].name;
export const nextMission = area => campaignAreas[campaignAreas.indexOf(area) + 1];
