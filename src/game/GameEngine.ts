import { sound, type SfxName } from './audio';
import { circlesOverlap, dist } from './Collision';
import { spawnOrb, updateOrbs, type Orb } from './Collectibles';
import {
  ARENA_H, ARENA_W, BONUS_ORB_POINTS, COLORS, COUNTDOWN_SECONDS, DASH_COOLDOWN, EVENT_SURVIVED_POINTS, FIXED_STEP,
  FLAWLESS_EVENT_POINTS, HAZARD_LIFETIME, INVULN_TIME, MAX_ORBS, NEAR_MISS_DISTANCE, NEAR_MISS_POINTS, ROUND_SECONDS,
  START_LIVES, SURVIVAL_POINTS_PER_SEC, TILE,
} from './constants';
import { EventManager, type World } from './EventManager';
import { isHazardActive, spawnHazard, updateHazards, type Hazard } from './Hazards';
import type { DirectorGameState } from './offlineGenerator';
import { createPlayer, isDashing, updatePlayer, type Player } from './Player';
import { Rng, randomSeed } from './rng';
import { bestScore, saveScore } from './storage';
import { pickTitle } from './titles';
import { generateOfflineEvent } from './offlineGenerator';
import type { GameState, GameSummary, HudSnapshot, InputState, Mechanic, Modifiers, RoundStats, Vec } from './types';
import { chaosService } from '../services/chaosService';

interface Particle { x: number; y: number; vx: number; vy: number; life: number; max: number; color: string; size: number }
interface Popup { x: number; y: number; text: string; color: string; life: number }

const GAME_KEYS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'KeyW', 'KeyA', 'KeyS', 'KeyD']);
const RUNNING: GameState[] = ['PLAYING', 'EVENT_ANNOUNCEMENT'];
const MAX_PARTICLES = 500;

const defaultModifiers = (): Modifiers => ({
  reverse: false, speedMul: 1, hazardRateMul: 1, worldTimeScale: 1, scoreMul: 1, playerScale: 1, magnet: null,
});

const freshStats = (): RoundStats => ({
  score: 0, survivalTime: 0, orbsCollected: 0, bonusOrbs: 0, eventsSurvived: 0, livesLost: 0, nearMisses: 0, dashes: 0, won: false, hitsBy: {},
});

export interface EngineOptions {
  seed?: number;
  onSnapshot: (s: HudSnapshot) => void;
}

export class GameEngine implements World {
  rng: Rng;
  player: Player = createPlayer();
  orbs: Orb[] = [];
  hazards: Hazard[] = [];
  time = 0;
  reducedMotion: boolean;
  magnetTarget: Vec | null = null;

  private ctx: CanvasRenderingContext2D;
  private state: GameState = 'MENU';
  private pausedFrom: GameState = 'PLAYING';
  private events = new EventManager();
  private mods: Modifiers = defaultModifiers();
  private particles: Particle[] = [];
  private popups: Popup[] = [];
  private keys = new Set<string>();
  private dashQueued = false;
  private elapsed = 0;
  private countdown = 0;
  private score = 0;
  private lives = START_LIVES;
  private stats: RoundStats = freshStats();
  private summary: GameSummary | null = null;
  private hitTimes: number[] = [];
  private nearPending = new Set<number>();
  private orbSpawnT = 0;
  private hazardSpawnT = 0;
  private shake = 0;
  private flash = 0;
  private resolution = 1;
  private raf = 0;
  private last = 0;
  private acc = 0;
  private lastEmit = 0;
  private lastEmittedState: GameState | null = null;
  private fixedSeed: number | undefined;
  private forcedMechanic: Mechanic | null = null;
  private attractRng = new Rng(randomSeed());
  private onSnapshot: (s: HudSnapshot) => void;
  private motionQuery: MediaQueryList;

  constructor(private canvas: HTMLCanvasElement, opts: EngineOptions) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D not supported');
    this.ctx = ctx;
    this.onSnapshot = opts.onSnapshot;
    this.fixedSeed = opts.seed;
    this.rng = new Rng(opts.seed ?? randomSeed());
    this.motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    this.reducedMotion = this.motionQuery.matches;
    this.motionQuery.addEventListener('change', this.onMotionChange);
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    document.addEventListener('visibilitychange', this.onVisibility);
    this.setResolution(1);
    this.resetAttract();
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
    this.emit(true);
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.motionQuery.removeEventListener('change', this.onMotionChange);
  }

  setResolution(k: number) {
    this.resolution = Math.max(0.5, Math.min(2.5, k));
    this.canvas.width = Math.round(ARENA_W * this.resolution);
    this.canvas.height = Math.round(ARENA_H * this.resolution);
  }

  setMuted(muted: boolean) {
    sound.setMuted(muted);
  }

  get currentState() {
    return this.state;
  }

  // ---------- state transitions ----------

  startGame() {
    sound.unlock();
    (document.activeElement as HTMLElement | null)?.blur?.();
    this.rng = new Rng(this.fixedSeed ?? randomSeed());
    this.player = createPlayer();
    this.orbs = [];
    for (let i = 0; i < 4; i++) this.orbs.push(spawnOrb(this.rng, 'normal', this.player));
    this.hazards = [];
    this.particles = [];
    this.popups = [];
    this.events.reset();
    this.mods = defaultModifiers();
    this.magnetTarget = null;
    this.score = 0;
    this.lives = START_LIVES;
    this.elapsed = 0;
    this.stats = freshStats();
    this.summary = null;
    this.hitTimes = [];
    this.nearPending.clear();
    this.orbSpawnT = 0.5;
    this.hazardSpawnT = 1.5;
    this.keys.clear();
    this.dashQueued = false;
    this.countdown = COUNTDOWN_SECONDS;
    this.acc = 0;
    this.state = 'COUNTDOWN';
    sound.play('tick');
    chaosService.prefetch(this.directorState(), []);
    this.emit(true);
  }

  restart() {
    this.events.abort(this);
    this.startGame();
  }

  toMenu() {
    this.events.abort(this);
    this.state = 'MENU';
    this.summary = null;
    this.resetAttract();
    this.emit(true);
  }

  pause() {
    if (!RUNNING.includes(this.state) && this.state !== 'COUNTDOWN') return;
    this.pausedFrom = this.state;
    this.state = 'PAUSED';
    this.keys.clear();
    this.emit(true);
  }

  resume() {
    if (this.state !== 'PAUSED') return;
    (document.activeElement as HTMLElement | null)?.blur?.();
    this.state = this.pausedFrom;
    this.last = performance.now();
    this.acc = 0;
    this.emit(true);
  }

  /** Dev/testing helper: make the next chaos event use this mechanic, starting now. */
  debugForceEvent(mechanic: Mechanic) {
    this.forcedMechanic = mechanic;
    if (this.events.phase === 'idle') this.events.nextIn = 0;
  }

  togglePause() {
    if (this.state === 'PAUSED') this.resume();
    else this.pause();
  }

  private endGame(won: boolean) {
    this.events.abort(this);
    this.magnetTarget = null;
    const finalScore = Math.floor(this.score);
    this.stats = {
      ...this.stats,
      score: finalScore,
      survivalTime: Math.min(ROUND_SECONDS, this.elapsed),
      eventsSurvived: this.events.survived,
      won,
    };
    const { title, subtitle } = pickTitle(this.stats);
    const previousBest = bestScore();
    const rank = finalScore > 0
      ? saveScore({ score: finalScore, survivalTime: Number(this.stats.survivalTime.toFixed(1)), date: new Date().toISOString(), title })
      : null;
    this.summary = {
      stats: this.stats,
      title,
      subtitle,
      isNewBest: finalScore > previousBest,
      bestScore: Math.max(previousBest, finalScore),
      rank,
    };
    this.state = 'GAME_OVER';
    this.shake = 0;
    sound.play(won ? 'win' : 'gameover');
    this.emit(true);
  }

  // ---------- World interface (used by chaos mechanics) ----------

  damagePlayer(source: Mechanic | 'hazard') {
    if (!RUNNING.includes(this.state)) return;
    const p = this.player;
    if (p.invuln > 0 || isDashing(p)) return;
    this.lives -= 1;
    this.stats.livesLost += 1;
    this.stats.hitsBy[source] = (this.stats.hitsBy[source] ?? 0) + 1;
    this.events.hitDuringEvent = true;
    this.hitTimes.push(this.elapsed);
    p.invuln = INVULN_TIME;
    p.stun = 0.2;
    this.shake = 16;
    this.flash = 1;
    this.burst(p.x, p.y, COLORS.pink, 34, 340);
    this.popup(p.x, p.y - 30, '-1 LIFE', COLORS.pink);
    sound.play('hit');
    if (this.lives <= 0) this.endGame(false);
  }

  spawnHazardNow() {
    this.hazards.push(spawnHazard(this.rng, this.player, this.elapsed));
  }

  burst(x: number, y: number, color: string, count: number, speed = 200) {
    const n = this.reducedMotion ? Math.ceil(count / 3) : count;
    for (let i = 0; i < n && this.particles.length < MAX_PARTICLES; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.3 + Math.random() * 0.7);
      const life = 0.35 + Math.random() * 0.45;
      this.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life, max: life, color, size: 2 + Math.random() * 3 });
    }
  }

  sfx(name: SfxName) {
    sound.play(name);
  }

  // ---------- loop ----------

  private frame = (now: number) => {
    this.raf = requestAnimationFrame(this.frame);
    const dt = Math.min(0.1, Math.max(0, (now - this.last) / 1000));
    this.last = now;

    if (RUNNING.includes(this.state)) {
      this.acc += dt;
      let steps = 0;
      while (this.acc >= FIXED_STEP && steps < 12 && RUNNING.includes(this.state)) {
        this.step(FIXED_STEP);
        this.acc -= FIXED_STEP;
        steps++;
      }
      if (steps >= 12) this.acc = 0;
    } else if (this.state === 'COUNTDOWN') {
      const before = Math.ceil(this.countdown);
      this.countdown -= dt;
      this.time += dt;
      if (Math.ceil(this.countdown) !== before && this.countdown > 0) sound.play('tick');
      if (this.countdown <= 0) {
        this.state = 'PLAYING';
        sound.play('go');
        this.popup(this.player.x, this.player.y - 40, 'GO!', COLORS.lime);
        this.emit(true);
      }
    } else if (this.state === 'MENU') {
      this.updateAttract(dt);
    }

    if (this.state !== 'PAUSED') {
      this.updateFx(dt);
    }
    this.render();
    this.emit(false, now);
  };

  private step(dt: number) {
    this.mods = defaultModifiers();
    this.events.modify(this.mods);
    const mods = this.mods;
    const wdt = dt * mods.worldTimeScale;
    const p = this.player;
    this.time += dt;
    this.elapsed += dt;

    // Magnet: drag the player toward the nearest orb in range.
    let pull: Vec | null = null;
    this.magnetTarget = null;
    if (mods.magnet) {
      let best: Orb | null = null;
      let bestD = mods.magnet.radius;
      for (const o of this.orbs) {
        const d = dist(o.x, o.y, p.x, p.y);
        if (d < bestD) { best = o; bestD = d; }
      }
      if (best && bestD > 1) {
        const k = mods.magnet.strength * (0.45 + 0.55 * (1 - bestD / mods.magnet.radius));
        pull = { x: ((best.x - p.x) / bestD) * k, y: ((best.y - p.y) / bestD) * k };
        this.magnetTarget = { x: best.x, y: best.y };
      }
    }

    if (updatePlayer(p, this.readInput(), dt, mods, pull)) {
      this.stats.dashes++;
      this.burst(p.x, p.y, COLORS.lime, 10, 150);
      sound.play('dash');
    }

    // Orbs
    this.orbs = updateOrbs(this.orbs, wdt);
    this.orbSpawnT -= wdt;
    const normalOrbs = this.orbs.filter((o) => o.kind !== 'storm').length;
    if (this.orbSpawnT <= 0 && normalOrbs < MAX_ORBS) {
      const bonus = this.rng.chance(0.12);
      this.orbs.push(spawnOrb(this.rng, bonus ? 'bonus' : 'normal', p, undefined, bonus ? 7 : Infinity));
      this.orbSpawnT = 0.7;
    }
    for (const o of this.orbs) {
      if (o.ttl <= 0 || (o.kind === 'storm' && o.age < 0.3)) continue;
      if (circlesOverlap(p, { x: o.x, y: o.y, r: o.r + 4 })) {
        o.ttl = 0;
        const pts = o.value * mods.scoreMul;
        this.score += pts;
        this.stats.orbsCollected++;
        if (o.kind !== 'normal') this.stats.bonusOrbs++;
        const color = o.kind === 'normal' ? COLORS.lime : COLORS.gold;
        this.burst(o.x, o.y, color, o.kind === 'normal' ? 10 : 18, 180);
        this.popup(o.x, o.y - 14, `+${pts}`, color);
        sound.play(o.value >= BONUS_ORB_POINTS ? 'bonus' : 'collect');
      }
    }
    this.orbs = this.orbs.filter((o) => o.ttl > 0);

    // Hazards
    const maxHazards = Math.min(9, 3 + Math.floor(this.elapsed / 12)) + (mods.hazardRateMul > 1 ? 2 : 0);
    this.hazardSpawnT -= wdt * mods.hazardRateMul;
    if (this.hazardSpawnT <= 0) {
      const active = this.hazards.filter((h) => h.age < HAZARD_LIFETIME).length;
      if (active < maxHazards) this.spawnHazardNow();
      this.hazardSpawnT = Math.max(1.1, 2.8 - this.elapsed * 0.025);
    }
    this.hazards = updateHazards(
      this.hazards,
      wdt,
      mods.magnet ? { x: p.x, y: p.y, pull: mods.magnet.hazardPull } : null,
    );
    const body = { x: p.x, y: p.y, r: p.r * 0.85 };
    for (const h of this.hazards) {
      if (!isHazardActive(h)) continue;
      if (circlesOverlap(body, h)) {
        h.nearMissed = true;
        this.nearPending.delete(h.id);
        this.damagePlayer('hazard');
        if (!RUNNING.includes(this.state)) return;
        continue;
      }
      const gap = dist(h.x, h.y, p.x, p.y) - h.r - p.r;
      if (gap < NEAR_MISS_DISTANCE) {
        if (!h.nearMissed && p.invuln <= 0) this.nearPending.add(h.id);
      } else if (this.nearPending.has(h.id)) {
        this.nearPending.delete(h.id);
        h.nearMissed = true;
        const pts = NEAR_MISS_POINTS * mods.scoreMul;
        this.score += pts;
        this.stats.nearMisses++;
        this.popup(p.x, p.y - p.r - 18, `CLOSE CALL +${pts}`, COLORS.cyan);
        sound.play('nearMiss');
      }
    }

    this.score += SURVIVAL_POINTS_PER_SEC * dt * mods.scoreMul;

    // Chaos events
    const timeLeft = ROUND_SECONDS - this.elapsed;
    const signal = this.events.tick(this, dt, timeLeft, () => {
      if (this.forcedMechanic) {
        const forced = this.forcedMechanic;
        this.forcedMechanic = null;
        for (let i = 0; i < 50; i++) {
          const ev = generateOfflineEvent(this.rng, this.directorState(), []);
          if (ev.mechanic === forced) return ev;
        }
      }
      return chaosService.takeEvent(this.rng, this.directorState(), this.events.history);
    });
    if (!RUNNING.includes(this.state)) return;
    if (signal === 'announced') {
      this.state = 'EVENT_ANNOUNCEMENT';
      sound.play('event');
      this.emit(true);
    } else if (signal === 'activated') {
      this.state = 'PLAYING';
      if (this.events.current?.mechanic === 'lava_tiles') sound.play('ignite');
      chaosService.prefetch(this.directorState(), this.events.history);
      this.emit(true);
    } else if (signal === 'ended') {
      const flawless = !this.events.hitDuringEvent;
      const pts = EVENT_SURVIVED_POINTS + (flawless ? FLAWLESS_EVENT_POINTS : 0);
      this.score += pts;
      this.popup(ARENA_W / 2, 120, flawless ? `FLAWLESS! +${pts}` : `EVENT SURVIVED +${pts}`, COLORS.lime);
      this.emit(true);
    }

    if (this.elapsed >= ROUND_SECONDS) this.endGame(true);
  }

  private updateFx(dt: number) {
    for (const pt of this.particles) {
      pt.life -= dt;
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      pt.vx *= 0.92;
      pt.vy *= 0.92;
    }
    this.particles = this.particles.filter((pt) => pt.life > 0);
    for (const pop of this.popups) {
      pop.life -= dt;
      pop.y -= 40 * dt;
    }
    this.popups = this.popups.filter((pop) => pop.life > 0);
    this.shake *= Math.exp(-dt * 9);
    this.flash = Math.max(0, this.flash - dt * 3);
  }

  private directorState(): DirectorGameState {
    return {
      score: Math.floor(this.score),
      lives: this.lives,
      elapsedSeconds: Math.floor(this.elapsed),
      timeLeftSeconds: Math.max(0, Math.ceil(ROUND_SECONDS - this.elapsed)),
      eventsSurvived: this.events.survived,
      livesLostRecently: this.hitTimes.filter((t) => this.elapsed - t < 15).length,
    };
  }

  private popup(x: number, y: number, text: string, color: string) {
    this.popups.push({ x, y, text, color, life: 1 });
  }

  // ---------- attract mode (animated menu background) ----------

  private resetAttract() {
    this.player = createPlayer();
    this.orbs = [];
    this.hazards = [];
    for (let i = 0; i < 6; i++) this.orbs.push(spawnOrb(this.attractRng, i % 4 === 0 ? 'bonus' : 'normal', { x: -999, y: -999 }));
    for (let i = 0; i < 4; i++) {
      const h = spawnHazard(this.attractRng, { x: ARENA_W / 2, y: ARENA_H / 2 }, 0);
      h.telegraph = 0;
      this.hazards.push(h);
    }
  }

  private updateAttract(dt: number) {
    this.time += dt;
    const t = this.time;
    const p = this.player;
    p.x = ARENA_W / 2 + Math.sin(t * 0.7) * 420 + Math.sin(t * 1.9) * 60;
    p.y = ARENA_H / 2 + Math.sin(t * 1.1) * 220;
    p.trail.push({ x: p.x, y: p.y });
    if (p.trail.length > 14) p.trail.shift();
    for (const h of this.hazards) h.age = Math.min(h.age, 1);
    this.hazards = updateHazards(this.hazards, dt, null);
    for (const o of this.orbs) {
      o.age += dt;
      if (circlesOverlap(p, o)) {
        this.burst(o.x, o.y, o.kind === 'normal' ? COLORS.lime : COLORS.gold, 10, 160);
        Object.assign(o, spawnOrb(this.attractRng, o.kind, p));
      }
    }
  }

  // ---------- input ----------

  private readInput(): InputState {
    const k = this.keys;
    const x = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
    const y = (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0) - (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0);
    const dash = this.dashQueued;
    this.dashQueued = false;
    return { x, y, dash };
  }

  private onKeyDown = (e: KeyboardEvent) => {
    const inGame = RUNNING.includes(this.state) || this.state === 'COUNTDOWN';
    if (GAME_KEYS.has(e.code) && (inGame || this.state === 'PAUSED')) e.preventDefault();
    if (e.code === 'Escape' || e.code === 'KeyP') {
      if (inGame || this.state === 'PAUSED') {
        e.preventDefault();
        this.togglePause();
      }
      return;
    }
    if (e.code === 'KeyR' && (this.state === 'PAUSED' || this.state === 'GAME_OVER') && !e.repeat) {
      this.restart();
      return;
    }
    if (!inGame) return;
    this.keys.add(e.code);
    if (e.code === 'Space' && !e.repeat) this.dashQueued = true;
  };

  private onKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.code);
  };

  private onBlur = () => {
    this.keys.clear();
    this.pause();
  };

  private onVisibility = () => {
    if (document.hidden) this.onBlur();
  };

  private onMotionChange = (e: MediaQueryListEvent) => {
    this.reducedMotion = e.matches;
  };

  // ---------- HUD bridge ----------

  private emit(force: boolean, now = performance.now()) {
    const stateChanged = this.state !== this.lastEmittedState;
    if (!force && !stateChanged) {
      if (this.state === 'MENU' || this.state === 'PAUSED' || this.state === 'GAME_OVER') return;
      if (now - this.lastEmit < 100) return;
    }
    this.lastEmit = now;
    this.lastEmittedState = this.state;
    const ev = this.events.current;
    const phase = this.events.phase;
    this.onSnapshot({
      state: this.state,
      score: Math.floor(this.score),
      lives: this.lives,
      timeLeft: Math.max(0, ROUND_SECONDS - this.elapsed),
      countdown: Math.ceil(this.countdown),
      dashCharge: 1 - this.player.dashCooldown / DASH_COOLDOWN,
      scoreMultiplier: this.mods.scoreMul,
      activeEvent:
        ev && phase !== 'idle'
          ? { event: ev, phase, remaining: Math.max(0, this.events.timer), total: phase === 'warning' ? 1.8 : this.events.total }
          : null,
      history: this.events.history.slice(-5),
      summary: this.summary,
      seed: this.rng.seed,
    });
  }

  // ---------- rendering ----------

  private render() {
    const ctx = this.ctx;
    const k = this.resolution;
    ctx.setTransform(k, 0, 0, k, 0, 0);
    ctx.save();
    if (this.shake > 0.5 && !this.reducedMotion) {
      ctx.translate((Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake);
    }
    this.drawBackground(ctx);
    if (this.state !== 'MENU') this.events.renderFloor(ctx, this);
    this.drawOrbs(ctx);
    this.drawHazards(ctx);
    this.drawParticles(ctx);
    this.drawPlayer(ctx);
    if (this.state !== 'MENU' && this.state !== 'GAME_OVER') this.events.renderOverlay(ctx, this);
    this.drawPopups(ctx);
    ctx.restore();
    if (this.flash > 0) {
      ctx.fillStyle = `rgba(255,61,154,${0.25 * this.flash})`;
      ctx.fillRect(0, 0, ARENA_W, ARENA_H);
    }
  }

  private drawBackground(ctx: CanvasRenderingContext2D) {
    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(-20, -20, ARENA_W + 40, ARENA_H + 40);
    // Checker tint so tiles (used by lava) read clearly.
    ctx.fillStyle = 'rgba(255,255,255,0.012)';
    for (let r = 0; r < ARENA_H / TILE; r++) {
      for (let c = (r % 2); c < ARENA_W / TILE; c += 2) ctx.fillRect(c * TILE, r * TILE, TILE, TILE);
    }
    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = TILE; x < ARENA_W; x += TILE) { ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, ARENA_H); }
    for (let y = TILE; y < ARENA_H; y += TILE) { ctx.moveTo(0, y + 0.5); ctx.lineTo(ARENA_W, y + 0.5); }
    ctx.stroke();
    // Slow scanning glow line for life in the background.
    if (!this.reducedMotion) {
      const sy = (this.time * 90) % (ARENA_H + 200) - 100;
      const g = ctx.createLinearGradient(0, sy - 60, 0, sy + 60);
      g.addColorStop(0, 'rgba(157,77,255,0)');
      g.addColorStop(0.5, 'rgba(157,77,255,0.06)');
      g.addColorStop(1, 'rgba(157,77,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, sy - 60, ARENA_W, 120);
    }
    // Grid intersections
    ctx.fillStyle = COLORS.gridBright;
    for (let x = TILE; x < ARENA_W; x += TILE) for (let y = TILE; y < ARENA_H; y += TILE) ctx.fillRect(x - 1, y - 1, 3, 3);
    // Arena border, tinted by the current event
    const accent = this.events.accentColor ?? COLORS.purple;
    ctx.save();
    ctx.shadowColor = accent;
    ctx.shadowBlur = 18;
    ctx.strokeStyle = accent;
    ctx.lineWidth = 3;
    ctx.strokeRect(1.5, 1.5, ARENA_W - 3, ARENA_H - 3);
    ctx.restore();
  }

  private drawOrbs(ctx: CanvasRenderingContext2D) {
    for (const o of this.orbs) {
      const color = o.kind === 'normal' ? COLORS.lime : COLORS.gold;
      let scale = 1 + Math.sin(this.time * 5 + o.id) * 0.08;
      let alpha = 1;
      if (o.kind === 'storm' && o.age < 0.3) {
        const k = o.age / 0.3;
        scale = 2.6 - 1.6 * k;
        alpha = k;
      }
      if (o.ttl < 1.2 && Number.isFinite(o.ttl)) alpha *= Math.floor(o.ttl * 10) % 2 === 0 ? 0.35 : 1;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.shadowColor = color;
      ctx.shadowBlur = 16;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(o.x, o.y, o.r * scale, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.beginPath();
      ctx.arc(o.x - o.r * 0.3, o.y - o.r * 0.3, o.r * 0.3, 0, Math.PI * 2);
      ctx.fill();
      if (o.kind !== 'normal') {
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        const rot = this.time * 2 + o.id;
        for (let i = 0; i < 4; i++) {
          const a = rot + (i * Math.PI) / 2;
          ctx.moveTo(o.x + Math.cos(a) * (o.r + 4), o.y + Math.sin(a) * (o.r + 4));
          ctx.lineTo(o.x + Math.cos(a) * (o.r + 10), o.y + Math.sin(a) * (o.r + 10));
        }
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  private drawHazards(ctx: CanvasRenderingContext2D) {
    for (const h of this.hazards) {
      ctx.save();
      if (h.telegraph > 0) {
        const k = 1 - h.telegraph / 0.9;
        const blink = this.reducedMotion ? 1 : 0.5 + 0.5 * Math.sin(this.time * 30);
        ctx.strokeStyle = `rgba(255,61,154,${0.4 + 0.5 * blink})`;
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 5]);
        ctx.beginPath();
        ctx.arc(h.x, h.y, h.r + 14 * (1 - k), 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = `rgba(255,61,154,${0.15 + 0.3 * k})`;
        ctx.beginPath();
        ctx.arc(h.x, h.y, h.r * k, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        continue;
      }
      const fade = h.age > HAZARD_LIFETIME ? Math.max(0, 1 - (h.age - HAZARD_LIFETIME) / 0.6) : 1;
      ctx.globalAlpha = fade;
      ctx.translate(h.x, h.y);
      ctx.rotate(h.spin);
      ctx.shadowColor = COLORS.pink;
      ctx.shadowBlur = 20;
      ctx.fillStyle = COLORS.pink;
      ctx.beginPath();
      const spikes = 6;
      for (let i = 0; i < spikes * 2; i++) {
        const rr = i % 2 === 0 ? h.r * 1.25 : h.r * 0.65;
        const a = (i * Math.PI) / spikes;
        if (i === 0) ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
        else ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
      }
      ctx.closePath();
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#2a0a1c';
      ctx.beginPath();
      ctx.arc(0, 0, h.r * 0.35, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  private drawParticles(ctx: CanvasRenderingContext2D) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const pt of this.particles) {
      ctx.globalAlpha = pt.life / pt.max;
      ctx.fillStyle = pt.color;
      ctx.fillRect(pt.x - pt.size / 2, pt.y - pt.size / 2, pt.size, pt.size);
    }
    ctx.restore();
  }

  private drawPlayer(ctx: CanvasRenderingContext2D) {
    const p = this.player;
    const ghost = this.state === 'MENU';
    const giant = p.scale > 1.05;
    const color = giant ? COLORS.lime : COLORS.cyan;
    ctx.save();
    if (ghost) ctx.globalAlpha = 0.55;
    for (let i = 0; i < p.trail.length; i++) {
      const t = p.trail[i];
      const k = i / p.trail.length;
      ctx.fillStyle = isDashing(p) ? `rgba(198,255,61,${0.5 * k})` : `rgba(61,232,255,${0.18 * k})`;
      ctx.beginPath();
      ctx.arc(t.x, t.y, p.r * (0.4 + 0.6 * k), 0, Math.PI * 2);
      ctx.fill();
    }
    const blinking = p.invuln > 0 && Math.floor(p.invuln * 12) % 2 === 0;
    if (!blinking) {
      ctx.shadowColor = color;
      ctx.shadowBlur = 24;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = COLORS.bgDeep;
      ctx.beginPath();
      ctx.arc(p.x + p.facing.x * p.r * 0.38, p.y + p.facing.y * p.r * 0.38, p.r * 0.32, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = COLORS.white;
      ctx.beginPath();
      ctx.arc(p.x + p.facing.x * p.r * 0.45, p.y + p.facing.y * p.r * 0.45, p.r * 0.12, 0, Math.PI * 2);
      ctx.fill();
    }
    if (!ghost && this.state !== 'GAME_OVER') {
      const charge = 1 - p.dashCooldown / DASH_COOLDOWN;
      ctx.strokeStyle = charge >= 1 ? 'rgba(198,255,61,0.85)' : 'rgba(244,240,255,0.3)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r + 7, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * charge);
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawPopups(ctx: CanvasRenderingContext2D) {
    ctx.save();
    ctx.textAlign = 'center';
    ctx.font = 'bold 18px "Bungee", "Space Grotesk", sans-serif';
    for (const pop of this.popups) {
      ctx.globalAlpha = Math.min(1, pop.life * 2);
      ctx.fillStyle = '#000';
      ctx.fillText(pop.text, pop.x + 2, pop.y + 2);
      ctx.fillStyle = pop.color;
      ctx.fillText(pop.text, pop.x, pop.y);
    }
    ctx.restore();
  }
}
