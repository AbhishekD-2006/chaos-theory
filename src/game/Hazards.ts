import { ARENA_H, ARENA_W, HAZARD_LIFETIME, HAZARD_TELEGRAPH } from './constants';
import { dist } from './Collision';
import type { Rng } from './rng';
import type { Vec } from './types';

export interface Hazard {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  telegraph: number;
  age: number;
  spin: number;
  nearMissed: boolean;
}

let hazardId = 0;

export const isHazardActive = (h: Hazard) => h.telegraph <= 0 && h.age < HAZARD_LIFETIME;

export function spawnHazard(rng: Rng, player: Vec, elapsed: number): Hazard {
  let x = 0;
  let y = 0;
  for (let i = 0; i < 16; i++) {
    x = rng.range(60, ARENA_W - 60);
    y = rng.range(60, ARENA_H - 60);
    if (dist(x, y, player.x, player.y) > 280) break;
  }
  // Aim loosely at the player so hazards feel intentional but stay dodgeable.
  const aim = Math.atan2(player.y - y, player.x - x) + rng.range(-0.9, 0.9);
  const speed = rng.range(130, 190) + Math.min(90, elapsed * 1.5);
  return {
    id: hazardId++,
    x,
    y,
    vx: Math.cos(aim) * speed,
    vy: Math.sin(aim) * speed,
    r: rng.range(13, 19),
    telegraph: HAZARD_TELEGRAPH,
    age: 0,
    spin: rng.range(0, Math.PI * 2),
    nearMissed: false,
  };
}

/** Advances hazards; returns survivors (expired ones fade out and are removed). */
export function updateHazards(hazards: Hazard[], dt: number, attractor: { x: number; y: number; pull: number } | null): Hazard[] {
  for (const h of hazards) {
    h.age += dt;
    h.spin += dt * 3;
    if (h.telegraph > 0) {
      h.telegraph -= dt;
      continue;
    }
    if (attractor && attractor.pull > 0) {
      const dx = attractor.x - h.x;
      const dy = attractor.y - h.y;
      const d = Math.hypot(dx, dy) || 1;
      h.vx += (dx / d) * attractor.pull * dt;
      h.vy += (dy / d) * attractor.pull * dt;
      const sp = Math.hypot(h.vx, h.vy);
      const max = 300;
      if (sp > max) {
        h.vx = (h.vx / sp) * max;
        h.vy = (h.vy / sp) * max;
      }
    }
    h.x += h.vx * dt;
    h.y += h.vy * dt;
    if (h.x < h.r) { h.x = h.r; h.vx = Math.abs(h.vx); }
    if (h.x > ARENA_W - h.r) { h.x = ARENA_W - h.r; h.vx = -Math.abs(h.vx); }
    if (h.y < h.r) { h.y = h.r; h.vy = Math.abs(h.vy); }
    if (h.y > ARENA_H - h.r) { h.y = ARENA_H - h.r; h.vy = -Math.abs(h.vy); }
  }
  return hazards.filter((h) => h.age < HAZARD_LIFETIME + 0.6);
}
