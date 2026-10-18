import { MECHANICS, MECHANIC_IDS, DURATION_RANGE, validateChaosEvent } from '../../shared/chaosSchema';
import { MECHANIC_INFO } from './mechanics';
import type { Rng } from './rng';
import type { ChaosEvent, Mechanic } from './types';

export interface DirectorGameState {
  score: number;
  lives: number;
  elapsedSeconds: number;
  timeLeftSeconds: number;
  eventsSurvived: number;
  livesLostRecently: number;
}

let eventCounter = 0;
export const nextEventId = () => `ev-${Date.now().toString(36)}-${(eventCounter++).toString(36)}`;

export function suggestedDifficulty(gs: DirectorGameState): number {
  let d = 1 + gs.elapsedSeconds / 18 + gs.score / 600;
  if (gs.lives <= 1) d -= 1.5;
  if (gs.livesLostRecently > 0) d -= 0.5;
  return Math.max(1, Math.min(5, Math.round(d)));
}

/** Rule-based chaos director used when the AI is unavailable. */
export function generateOfflineEvent(rng: Rng, gs: DirectorGameState, recent: ChaosEvent[]): ChaosEvent {
  const recentMechanics = recent.slice(-2).map((e) => e.mechanic);
  const recentNames = new Set(recent.map((e) => e.name));
  let pool = MECHANIC_IDS.filter((m) => !recentMechanics.includes(m));
  if (pool.length === 0) pool = [...MECHANIC_IDS];

  // Struggling players get kinder events more often.
  const weighted: Mechanic[] = [];
  for (const m of pool) {
    const kind = m === 'treasure_storm' || m === 'slow_motion';
    const copies = gs.lives <= 1 ? (kind ? 3 : 1) : kind ? 1 : 2;
    for (let i = 0; i < copies; i++) weighted.push(m);
  }
  const mechanic = rng.pick(weighted);
  const difficulty = Math.max(1, Math.min(5, suggestedDifficulty(gs) + rng.int(-1, 1)));

  const library = MECHANIC_INFO[mechanic].library;
  const fresh = library.filter((l) => !recentNames.has(l.name));
  const flavour = rng.pick(fresh.length ? fresh : library);

  // Jitter around the difficulty-scaled midpoint; validation clamps anything out of range.
  const parameters: Record<string, number> = {};
  const t = (difficulty - 1) / 4;
  for (const [key, spec] of Object.entries(MECHANICS[mechanic].params)) {
    const easierWhenHigh = key === 'cycleSeconds' || key === 'pulseInterval' || key === 'timeScale';
    const base = easierWhenHigh ? 1 - t : t;
    const jittered = Math.max(0, Math.min(1, base + rng.range(-0.15, 0.15)));
    parameters[key] = spec.min + (spec.max - spec.min) * jittered;
  }

  const result = validateChaosEvent({
    name: flavour.name,
    description: flavour.description,
    mechanic,
    durationSeconds: rng.range(DURATION_RANGE.min, DURATION_RANGE.max),
    difficulty,
    parameters,
  });
  if (!result.ok) throw new Error(result.error);
  return { ...result.event, id: nextEventId(), source: 'offline' };
}
