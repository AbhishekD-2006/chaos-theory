import { ARENA_H, ARENA_W, COLORS, COLS, EVENT_GAP, EVENT_WARNING, FIRST_EVENT_DELAY, ORB_POINTS, ROWS, TILE } from './constants';
import { circleRectOverlap, circlesOverlap, dist } from './Collision';
import { spawnOrb, type Orb } from './Collectibles';
import type { Hazard } from './Hazards';
import { MECHANIC_INFO } from './mechanics';
import type { Player } from './Player';
import type { Rng } from './rng';
import type { ChaosEvent, Mechanic, Modifiers, Vec } from './types';

/** The slice of the engine that chaos mechanics are allowed to touch. */
export interface World {
  rng: Rng;
  player: Player;
  orbs: Orb[];
  hazards: Hazard[];
  time: number;
  reducedMotion: boolean;
  magnetTarget: Vec | null;
  damagePlayer(source: Mechanic | 'hazard'): void;
  spawnHazardNow(): void;
  burst(x: number, y: number, color: string, count: number, speed?: number): void;
  sfx(name: 'boom' | 'ignite' | 'drop'): void;
}

interface Runtime {
  tiles: { c: number; r: number }[];
  cycleAge: number;
  cycleLen: number;
  zones: { x: number; y: number; r: number; age: number; color: string; boomed: boolean }[];
  beatT: number;
  spawned: number;
  spawnT: number;
}

const LAVA_WARN = 1.1;
const DISCO_WARN = 1.1;
const DISCO_BOOM = 0.3;
const DISCO_COLORS = [COLORS.pink, COLORS.purple, COLORS.lime, COLORS.cyan];

const freshRuntime = (): Runtime => ({ tiles: [], cycleAge: 0, cycleLen: 0, zones: [], beatT: 0.35, spawned: 0, spawnT: 0 });

interface Handler {
  start?(w: World, ev: ChaosEvent, s: Runtime, duration: number): void;
  update?(w: World, ev: ChaosEvent, s: Runtime, dt: number, remaining: number): void;
  modify?(m: Modifiers, ev: ChaosEvent): void;
  end?(w: World, ev: ChaosEvent, s: Runtime): void;
  renderFloor?(ctx: CanvasRenderingContext2D, w: World, ev: ChaosEvent, s: Runtime): void;
  renderOverlay?(ctx: CanvasRenderingContext2D, w: World, ev: ChaosEvent, s: Runtime, remaining: number): void;
}

const lavaHot = (s: Runtime) => s.cycleAge >= LAVA_WARN && s.cycleAge < s.cycleLen - 0.12;

const HANDLERS: Record<Mechanic, Handler> = {
  reverse_controls: {
    modify: (m) => { m.reverse = true; },
    renderOverlay(ctx, w) {
      const pulse = 0.5 + 0.5 * Math.sin(w.time * 6);
      ctx.strokeStyle = `rgba(157,77,255,${0.35 + 0.35 * pulse})`;
      ctx.lineWidth = 10;
      ctx.strokeRect(5, 5, ARENA_W - 10, ARENA_H - 10);
      const p = w.player;
      ctx.fillStyle = COLORS.purple;
      ctx.font = 'bold 22px "Bungee", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('⇄', p.x, p.y - p.r - 14);
    },
  },

  lava_tiles: {
    start(_w, _ev, s) { s.cycleAge = 0; s.cycleLen = 0; s.tiles = []; },
    update(w, ev, s, dt, remaining) {
      s.cycleAge += dt;
      if (s.cycleAge >= s.cycleLen) {
        s.tiles = [];
        if (remaining > LAVA_WARN + 0.6) {
          const count = Math.round(ev.parameters.tileFraction * COLS * ROWS);
          const pc = Math.floor(w.player.x / TILE);
          const pr = Math.floor(w.player.y / TILE);
          const taken = new Set<number>();
          while (s.tiles.length < count) {
            const c = w.rng.int(0, COLS - 1);
            const r = w.rng.int(0, ROWS - 1);
            const key = r * COLS + c;
            if (taken.has(key) || (c === pc && r === pr)) continue;
            taken.add(key);
            s.tiles.push({ c, r });
          }
          s.cycleAge = 0;
          s.cycleLen = Math.min(ev.parameters.cycleSeconds, remaining);
        }
      }
      if (lavaHot(s)) {
        const p = w.player;
        const body = { x: p.x, y: p.y, r: p.r * 0.8 };
        for (const t of s.tiles) {
          if (circleRectOverlap(body, t.c * TILE + 5, t.r * TILE + 5, TILE - 10, TILE - 10)) {
            w.damagePlayer('lava_tiles');
            break;
          }
        }
      }
    },
    end(_w, _ev, s) { s.tiles = []; },
    renderFloor(ctx, w, _ev, s) {
      const hot = lavaHot(s);
      const warnProgress = Math.min(1, s.cycleAge / LAVA_WARN);
      for (const t of s.tiles) {
        const x = t.c * TILE;
        const y = t.r * TILE;
        if (hot) {
          const flicker = w.reducedMotion ? 0.85 : 0.75 + 0.25 * Math.sin(w.time * 20 + t.c * 3 + t.r);
          const g = ctx.createLinearGradient(x, y, x, y + TILE);
          g.addColorStop(0, `rgba(255,122,26,${flicker})`);
          g.addColorStop(1, `rgba(255,61,90,${flicker})`);
          ctx.fillStyle = g;
          ctx.fillRect(x + 3, y + 3, TILE - 6, TILE - 6);
          ctx.fillStyle = 'rgba(255,230,140,0.55)';
          ctx.fillRect(x + 12, y + 12, TILE - 24, 4);
        } else {
          const blink = w.reducedMotion ? 1 : 0.5 + 0.5 * Math.sin(w.time * (10 + warnProgress * 14));
          ctx.fillStyle = `rgba(255,122,26,${0.08 + 0.2 * warnProgress})`;
          ctx.fillRect(x + 3, y + 3, TILE - 6, TILE - 6);
          ctx.strokeStyle = `rgba(255,122,26,${0.4 + 0.6 * blink})`;
          ctx.lineWidth = 3;
          ctx.setLineDash([10, 6]);
          ctx.strokeRect(x + 5, y + 5, TILE - 10, TILE - 10);
          ctx.setLineDash([]);
        }
      }
    },
  },

  treasure_storm: {
    start(_w, _ev, s) { s.spawned = 0; s.spawnT = 0; },
    update(w, ev, s, dt, remaining) {
      const count = ev.parameters.orbCount;
      if (s.spawned >= count) return;
      s.spawnT -= dt;
      if (s.spawnT <= 0) {
        const interval = Math.max(0.12, (ev.durationSeconds * 0.7) / count);
        s.spawnT = interval;
        s.spawned++;
        w.orbs.push(spawnOrb(w.rng, 'storm', w.player, ORB_POINTS * ev.parameters.bonusMultiplier, remaining + 1.5));
        w.sfx('drop');
      }
    },
    end(w) {
      for (const o of w.orbs) if (o.kind === 'storm') o.ttl = Math.min(o.ttl, 1.2);
    },
    renderOverlay(ctx, w) {
      if (w.reducedMotion) return;
      ctx.strokeStyle = 'rgba(255,210,61,0.18)';
      ctx.lineWidth = 2;
      for (let i = 0; i < 28; i++) {
        const x = (i * 97 + w.time * 60) % ARENA_W;
        const y = (i * 131 + w.time * 520) % ARENA_H;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x - 6, y - 26);
        ctx.stroke();
      }
    },
  },

  chaos_magnet: {
    modify(m, ev) {
      m.magnet = { strength: ev.parameters.strength, radius: ev.parameters.radius, hazardPull: ev.parameters.hazardPull };
    },
    renderOverlay(ctx, w, ev) {
      const p = w.player;
      const radius = ev.parameters.radius;
      ctx.lineWidth = 2;
      for (let i = 0; i < 3; i++) {
        const k = w.reducedMotion ? (i + 1) / 3 : ((w.time * 0.8 + i / 3) % 1);
        ctx.strokeStyle = `rgba(61,232,255,${0.35 * (1 - k)})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, radius * (1 - k) + p.r, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.strokeStyle = 'rgba(61,232,255,0.12)';
      ctx.setLineDash([4, 8]);
      ctx.beginPath();
      ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
      ctx.stroke();
      const t = w.magnetTarget;
      if (t) {
        ctx.strokeStyle = COLORS.cyan;
        ctx.lineWidth = 3;
        ctx.setLineDash([12, 8]);
        ctx.lineDashOffset = -w.time * 80;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(t.x, t.y);
        ctx.stroke();
        ctx.lineDashOffset = 0;
      }
      ctx.setLineDash([]);
      for (const h of w.hazards) {
        if (h.telegraph > 0 || dist(h.x, h.y, p.x, p.y) > radius) continue;
        ctx.strokeStyle = 'rgba(255,61,154,0.35)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(h.x, h.y);
        ctx.lineTo(h.x + (p.x - h.x) * 0.25, h.y + (p.y - h.y) * 0.25);
        ctx.stroke();
      }
    },
  },

  giant_mode: {
    modify: (m, ev) => { m.playerScale = ev.parameters.scale; },
  },

  speed_panic: {
    start(w) { w.spawnHazardNow(); },
    modify(m, ev) {
      m.speedMul = ev.parameters.speedMultiplier;
      m.hazardRateMul = ev.parameters.hazardRateMultiplier;
    },
    renderOverlay(ctx, w) {
      const n = w.reducedMotion ? 6 : 22;
      ctx.strokeStyle = 'rgba(255,61,154,0.22)';
      ctx.lineWidth = 2;
      for (let i = 0; i < n; i++) {
        const y = (i * 53 + 17) % ARENA_H;
        const x = (i * 211 + w.time * (w.reducedMotion ? 0 : 1400)) % (ARENA_W + 200) - 100;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x - 90, y);
        ctx.stroke();
      }
    },
  },

  slow_motion: {
    modify(m, ev) {
      m.worldTimeScale = ev.parameters.timeScale;
      m.scoreMul = ev.parameters.scoreMultiplier;
    },
    renderOverlay(ctx, _w, ev) {
      const g = ctx.createRadialGradient(ARENA_W / 2, ARENA_H / 2, ARENA_H * 0.35, ARENA_W / 2, ARENA_H / 2, ARENA_W * 0.7);
      g.addColorStop(0, 'rgba(61,232,255,0)');
      g.addColorStop(1, 'rgba(61,232,255,0.22)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, ARENA_W, ARENA_H);
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(0, 0, ARENA_W, 16);
      ctx.fillRect(0, ARENA_H - 16, ARENA_W, 16);
      ctx.fillStyle = COLORS.cyan;
      ctx.font = 'bold 18px "Bungee", sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(`SCORE x${ev.parameters.scoreMultiplier}`, ARENA_W - 24, ARENA_H - 30);
    },
  },

  disco_apocalypse: {
    start(_w, _ev, s) { s.zones = []; s.beatT = 0.3; },
    update(w, ev, s, dt, remaining) {
      s.beatT -= dt;
      if (s.beatT <= 0 && remaining > DISCO_WARN + DISCO_BOOM) {
        s.beatT = ev.parameters.pulseInterval;
        const r = ev.parameters.zoneRadius;
        for (let i = 0; i < ev.parameters.zoneCount; i++) {
          const nearPlayer = i === 0 && w.rng.chance(0.6);
          const x = nearPlayer ? w.player.x + w.rng.range(-70, 70) : w.rng.range(r, ARENA_W - r);
          const y = nearPlayer ? w.player.y + w.rng.range(-70, 70) : w.rng.range(r, ARENA_H - r);
          s.zones.push({ x, y, r, age: 0, color: DISCO_COLORS[i % DISCO_COLORS.length], boomed: false });
        }
      }
      for (const z of s.zones) {
        z.age += dt;
        if (!z.boomed && z.age >= DISCO_WARN) {
          z.boomed = true;
          w.burst(z.x, z.y, z.color, w.reducedMotion ? 6 : 18, 260);
          w.sfx('boom');
        }
        if (z.age >= DISCO_WARN && z.age < DISCO_WARN + DISCO_BOOM) {
          const p = w.player;
          if (circlesOverlap({ x: p.x, y: p.y, r: p.r * 0.8 }, z)) w.damagePlayer('disco_apocalypse');
        }
      }
      s.zones = s.zones.filter((z) => z.age < DISCO_WARN + DISCO_BOOM + 0.25);
    },
    end(_w, _ev, s) { s.zones = []; },
    renderFloor(ctx, w, _ev, s) {
      if (!w.reducedMotion) {
        const beat = Math.floor(w.time * 4);
        for (let i = 0; i < 10; i++) {
          const c = (beat * 7 + i * 5) % COLS;
          const r = (beat * 3 + i * 7) % ROWS;
          ctx.fillStyle = DISCO_COLORS[(beat + i) % 4] + '18';
          ctx.fillRect(c * TILE, r * TILE, TILE, TILE);
        }
      }
      for (const z of s.zones) {
        if (z.age < DISCO_WARN) {
          const k = z.age / DISCO_WARN;
          const blink = w.reducedMotion ? 1 : Math.floor(z.age * 10) % 2 === 0 ? 1 : 0.55;
          ctx.fillStyle = z.color + Math.round(0x10 + 0x30 * k).toString(16).padStart(2, '0');
          ctx.beginPath();
          ctx.arc(z.x, z.y, z.r, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = z.color;
          ctx.globalAlpha = blink;
          ctx.lineWidth = 3;
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(z.x, z.y, z.r * 0.25, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * k);
          ctx.lineWidth = 5;
          ctx.stroke();
          ctx.globalAlpha = 1;
        } else {
          const k = (z.age - DISCO_WARN) / (DISCO_BOOM + 0.25);
          ctx.fillStyle = z.color;
          ctx.globalAlpha = Math.max(0, 0.85 * (1 - k));
          ctx.beginPath();
          ctx.arc(z.x, z.y, z.r * (1 + 0.15 * k), 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha = 1;
        }
      }
    },
  },
};

export type EventSignal = 'announced' | 'activated' | 'ended';

export class EventManager {
  phase: 'idle' | 'warning' | 'active' = 'idle';
  current: ChaosEvent | null = null;
  timer = 0;
  total = 0;
  nextIn = FIRST_EVENT_DELAY;
  history: ChaosEvent[] = [];
  survived = 0;
  hitDuringEvent = false;
  private rt: Runtime = freshRuntime();

  reset() {
    this.phase = 'idle';
    this.current = null;
    this.timer = 0;
    this.total = 0;
    this.nextIn = FIRST_EVENT_DELAY;
    this.history = [];
    this.survived = 0;
    this.hitDuringEvent = false;
    this.rt = freshRuntime();
  }

  tick(w: World, dt: number, timeLeft: number, provide: () => ChaosEvent): EventSignal | null {
    if (this.phase === 'idle') {
      this.nextIn -= dt;
      if (this.nextIn > 0 || timeLeft < EVENT_WARNING + 4) return null;
      const ev = provide();
      this.current = ev;
      this.total = Math.min(ev.durationSeconds, timeLeft - EVENT_WARNING - 0.5);
      this.timer = EVENT_WARNING;
      this.phase = 'warning';
      this.history = [...this.history, ev].slice(-8);
      return 'announced';
    }
    const ev = this.current!;
    const handler = HANDLERS[ev.mechanic];
    if (this.phase === 'warning') {
      this.timer -= dt;
      if (this.timer > 0) return null;
      this.phase = 'active';
      this.timer = this.total;
      this.hitDuringEvent = false;
      this.rt = freshRuntime();
      handler.start?.(w, ev, this.rt, this.total);
      return 'activated';
    }
    this.timer -= dt;
    handler.update?.(w, ev, this.rt, dt, Math.max(0, this.timer));
    if (this.timer > 0) return null;
    handler.end?.(w, ev, this.rt);
    this.survived++;
    this.phase = 'idle';
    this.nextIn = EVENT_GAP;
    return 'ended';
  }

  /** Stop the current event immediately (game over / back to menu). */
  abort(w: World) {
    if (this.current && this.phase === 'active') HANDLERS[this.current.mechanic].end?.(w, this.current, this.rt);
    this.phase = 'idle';
    this.current = null;
  }

  modify(m: Modifiers) {
    if (this.phase === 'active' && this.current) HANDLERS[this.current.mechanic].modify?.(m, this.current);
  }

  renderFloor(ctx: CanvasRenderingContext2D, w: World) {
    if (this.phase === 'active' && this.current) HANDLERS[this.current.mechanic].renderFloor?.(ctx, w, this.current, this.rt);
  }

  renderOverlay(ctx: CanvasRenderingContext2D, w: World) {
    if (this.phase === 'active' && this.current) {
      HANDLERS[this.current.mechanic].renderOverlay?.(ctx, w, this.current, this.rt, this.timer);
    }
  }

  get accentColor(): string | null {
    return this.current && this.phase !== 'idle' ? MECHANIC_INFO[this.current.mechanic].color : null;
  }
}
