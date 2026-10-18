import { ARENA_H, ARENA_W, BONUS_ORB_POINTS, ORB_POINTS, ORB_RADIUS } from './constants';
import { dist } from './Collision';
import type { Rng } from './rng';
import type { Vec } from './types';

export type OrbKind = 'normal' | 'bonus' | 'storm';

export interface Orb {
  id: number;
  x: number;
  y: number;
  r: number;
  value: number;
  kind: OrbKind;
  age: number;
  /** Seconds until the orb expires; Infinity for permanent orbs. */
  ttl: number;
}

let orbId = 0;
const MARGIN = 40;

export function spawnOrb(rng: Rng, kind: OrbKind, avoid: Vec, value?: number, ttl = Infinity): Orb {
  let x = 0;
  let y = 0;
  for (let i = 0; i < 12; i++) {
    x = rng.range(MARGIN, ARENA_W - MARGIN);
    y = rng.range(MARGIN, ARENA_H - MARGIN);
    if (dist(x, y, avoid.x, avoid.y) > 140) break;
  }
  return {
    id: orbId++,
    x,
    y,
    r: kind === 'normal' ? ORB_RADIUS : ORB_RADIUS + 3,
    value: value ?? (kind === 'normal' ? ORB_POINTS : BONUS_ORB_POINTS),
    kind,
    age: 0,
    ttl,
  };
}

export function updateOrbs(orbs: Orb[], dt: number): Orb[] {
  for (const o of orbs) {
    o.age += dt;
    o.ttl -= dt;
  }
  return orbs.filter((o) => o.ttl > 0);
}
