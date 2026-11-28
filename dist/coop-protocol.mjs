export const COOP_SERVICE = 'immune-protocol-coop';
export const COOP_PROTOCOL_VERSION = 3;
export const COOP_MIN_PLAYERS = 2;
export const COOP_MAX_PLAYERS = 3;
export const COOP_TICK_RATE = 30;
export const COOP_RECONNECT_MS = 75_000;
export const COOP_HEALTH_PATH = '/healthz';
export const COOP_PATH = '/coop';
export const COOP_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const COOP_CODE_LENGTH = 8;
export const COOP_NAME_LIMIT = 24;
export const CAMPAIGN_AREAS = Object.freeze(['artery', 'junction', 'heart', 'lungs', 'stomach', 'intestines', 'colon', 'lymph', 'ear', 'brain']);
export const COOP_SUITS = Object.freeze(['vanguard', 'wraith', 'lifeline', 'bathysphere']);
export const DEFAULT_COOP_SUIT = COOP_SUITS[0];
// What the room's host picks in the lab: a campaign run or an Endless arena, and the difficulty.
export const COOP_MODES = Object.freeze(['campaign', 'endless']);
export const DEFAULT_COOP_SETTINGS = Object.freeze({ mode: 'campaign', difficulty: 'medium', arena: 'artery' });
