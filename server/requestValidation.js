import { isMechanic, sanitizeText } from '../shared/chaosSchema.js';

const num = (v, min, max, fallback = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};

/** Reduce the client's game state to a small, bounded summary for the prompt. */
export function sanitizeGameState(raw) {
  const gs = raw && typeof raw === 'object' ? raw : {};
  return {
    score: Math.round(num(gs.score, 0, 1e6)),
    lives: Math.round(num(gs.lives, 0, 3, 3)),
    elapsedSeconds: Math.round(num(gs.elapsedSeconds, 0, 600)),
    timeLeftSeconds: Math.round(num(gs.timeLeftSeconds, 0, 600, 60)),
    eventsSurvived: Math.round(num(gs.eventsSurvived, 0, 100)),
    livesLostRecently: Math.round(num(gs.livesLostRecently, 0, 3)),
  };
}

export function sanitizeRecentEvents(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .slice(-5)
    .filter((e) => e && typeof e === 'object' && isMechanic(e.mechanic))
    .map((e) => ({ mechanic: e.mechanic, name: sanitizeText(e.name, 28) }));
}
