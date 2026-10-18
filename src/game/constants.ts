export const ARENA_W = 1280;
export const ARENA_H = 720;
export const TILE = 80;
export const COLS = ARENA_W / TILE;
export const ROWS = ARENA_H / TILE;

export const ROUND_SECONDS = 60;
export const START_LIVES = 3;
export const COUNTDOWN_SECONDS = 3;

export const PLAYER_RADIUS = 15;
export const PLAYER_SPEED = 330;
export const PLAYER_RESPONSIVENESS = 14;
export const DASH_SPEED = 980;
export const DASH_TIME = 0.16;
export const DASH_COOLDOWN = 1.4;
export const INVULN_TIME = 1.6;

export const ORB_RADIUS = 9;
export const ORB_POINTS = 10;
export const BONUS_ORB_POINTS = 30;
export const MAX_ORBS = 6;
export const SURVIVAL_POINTS_PER_SEC = 2;
export const NEAR_MISS_POINTS = 15;
export const NEAR_MISS_DISTANCE = 20;
export const EVENT_SURVIVED_POINTS = 50;
export const FLAWLESS_EVENT_POINTS = 50;

export const HAZARD_TELEGRAPH = 0.9;
export const HAZARD_LIFETIME = 14;

export const FIRST_EVENT_DELAY = 3.5;
export const EVENT_WARNING = 1.8;
export const EVENT_GAP = 3.2;

export const FIXED_STEP = 1 / 120;

export const COLORS = {
  bg: '#121016',
  bgDeep: '#0b0a0e',
  grid: '#211c2a',
  gridBright: '#2f2740',
  purple: '#9d4dff',
  lime: '#c6ff3d',
  pink: '#ff3d9a',
  cyan: '#3de8ff',
  gold: '#ffd23d',
  orange: '#ff7a1a',
  white: '#f4f0ff',
} as const;
