import { ARENA_H, ARENA_W, DASH_COOLDOWN, DASH_SPEED, DASH_TIME, PLAYER_RADIUS, PLAYER_RESPONSIVENESS, PLAYER_SPEED } from './constants';
import type { InputState, Modifiers, Vec } from './types';

export interface Player {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  scale: number;
  dashTime: number;
  dashCooldown: number;
  dashDir: Vec;
  facing: Vec;
  invuln: number;
  stun: number;
  trail: Vec[];
}

export function createPlayer(): Player {
  return {
    x: ARENA_W / 2,
    y: ARENA_H / 2,
    vx: 0,
    vy: 0,
    r: PLAYER_RADIUS,
    scale: 1,
    dashTime: 0,
    dashCooldown: 0,
    dashDir: { x: 1, y: 0 },
    facing: { x: 1, y: 0 },
    invuln: 0,
    stun: 0,
    trail: [],
  };
}

export const isDashing = (p: Player) => p.dashTime > 0;

/** Returns true when a dash was started this step. */
export function updatePlayer(p: Player, input: InputState, dt: number, mods: Modifiers, pull: Vec | null): boolean {
  let ix = input.x;
  let iy = input.y;
  if (mods.reverse) {
    ix = -ix;
    iy = -iy;
  }
  const len = Math.hypot(ix, iy);
  if (len > 0) {
    ix /= len;
    iy /= len;
    p.facing = { x: ix, y: iy };
  }
  if (p.stun > 0) {
    p.stun -= dt;
    ix = 0;
    iy = 0;
  }

  let dashed = false;
  p.dashCooldown = Math.max(0, p.dashCooldown - dt);
  if (input.dash && p.dashCooldown <= 0 && p.stun <= 0) {
    p.dashTime = DASH_TIME;
    p.dashCooldown = DASH_COOLDOWN;
    p.dashDir = len > 0 ? { x: ix, y: iy } : { ...p.facing };
    dashed = true;
  }

  // Slow-motion slightly slows the player too, so the world still feels heavy.
  const speed = PLAYER_SPEED * mods.speedMul * (mods.worldTimeScale < 1 ? 0.85 : 1);
  if (p.dashTime > 0) {
    p.dashTime -= dt;
    p.vx = p.dashDir.x * DASH_SPEED * mods.speedMul;
    p.vy = p.dashDir.y * DASH_SPEED * mods.speedMul;
  } else {
    const k = 1 - Math.exp(-PLAYER_RESPONSIVENESS * dt);
    p.vx += (ix * speed - p.vx) * k;
    p.vy += (iy * speed - p.vy) * k;
  }

  p.x += (p.vx + (pull?.x ?? 0)) * dt;
  p.y += (p.vy + (pull?.y ?? 0)) * dt;

  const targetScale = mods.playerScale;
  p.scale += (targetScale - p.scale) * (1 - Math.exp(-6 * dt));
  p.r = PLAYER_RADIUS * p.scale;

  if (p.x < p.r) { p.x = p.r; p.vx = Math.max(0, p.vx); }
  if (p.x > ARENA_W - p.r) { p.x = ARENA_W - p.r; p.vx = Math.min(0, p.vx); }
  if (p.y < p.r) { p.y = p.r; p.vy = Math.max(0, p.vy); }
  if (p.y > ARENA_H - p.r) { p.y = ARENA_H - p.r; p.vy = Math.min(0, p.vy); }

  p.invuln = Math.max(0, p.invuln - dt);
  p.trail.push({ x: p.x, y: p.y });
  if (p.trail.length > 14) p.trail.shift();
  return dashed;
}
