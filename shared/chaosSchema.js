// Single source of truth for which chaos mechanics exist and what values are safe.
// Imported by both the browser game and the Node server. Model output is only ever
// passed through validateChaosEvent(); it is never executed.

export const DURATION_RANGE = Object.freeze({ min: 5, max: 10 });
export const DIFFICULTY_RANGE = Object.freeze({ min: 1, max: 5 });
export const NAME_MAX = 28;
export const DESCRIPTION_MAX = 110;
export const TAUNT_MAX = 90;

/** @type {Readonly<Record<string, { effect: string, params: Record<string, { min: number, max: number, integer?: boolean, doc: string }> }>>} */
export const MECHANICS = Object.freeze({
  reverse_controls: {
    effect: 'Inverts horizontal and vertical movement input.',
    params: {},
  },
  lava_tiles: {
    effect: 'Floor tiles flash a warning, then burn. Touching a burning tile costs a life.',
    params: {
      tileFraction: { min: 0.1, max: 0.3, doc: 'share of floor tiles that ignite each cycle' },
      cycleSeconds: { min: 2.4, max: 4, doc: 'seconds per warn+burn cycle (higher = easier)' },
    },
  },
  treasure_storm: {
    effect: 'Gold bonus orbs rain into the arena.',
    params: {
      orbCount: { min: 6, max: 18, integer: true, doc: 'number of bonus orbs dropped' },
      bonusMultiplier: { min: 2, max: 5, integer: true, doc: 'points multiplier of each bonus orb' },
    },
  },
  chaos_magnet: {
    effect: 'The player is dragged toward nearby orbs while hazards drift toward the player.',
    params: {
      strength: { min: 90, max: 260, doc: 'pull speed toward orbs in px/s' },
      radius: { min: 220, max: 420, doc: 'magnet reach in px' },
      hazardPull: { min: 0, max: 70, doc: 'how strongly hazards home in, px/s^2' },
    },
  },
  giant_mode: {
    effect: 'The player grows, making hazards harder to dodge but orbs easier to grab.',
    params: {
      scale: { min: 1.5, max: 2.4, doc: 'player size multiplier' },
    },
  },
  speed_panic: {
    effect: 'Player movement speeds up and hazards spawn much more often.',
    params: {
      speedMultiplier: { min: 1.3, max: 1.9, doc: 'player speed multiplier' },
      hazardRateMultiplier: { min: 1.4, max: 2.6, doc: 'hazard spawn rate multiplier' },
    },
  },
  slow_motion: {
    effect: 'The world slows down while the score multiplier rises.',
    params: {
      timeScale: { min: 0.35, max: 0.7, doc: 'world speed (lower = slower)' },
      scoreMultiplier: { min: 2, max: 3, integer: true, doc: 'score multiplier while active' },
    },
  },
  disco_apocalypse: {
    effect: 'Flashing rings mark spots on the floor that explode on the beat.',
    params: {
      pulseInterval: { min: 1.3, max: 2.4, doc: 'seconds between beats (higher = easier)' },
      zoneCount: { min: 2, max: 5, integer: true, doc: 'danger rings per beat' },
      zoneRadius: { min: 60, max: 120, doc: 'ring radius in px' },
    },
  },
});

export const MECHANIC_IDS = Object.freeze(Object.keys(MECHANICS));

// Params where a larger value makes the event easier rather than harder.
const EASIER_WHEN_HIGH = new Set(['cycleSeconds', 'pulseInterval', 'timeScale']);

const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

export function isMechanic(id) {
  return typeof id === 'string' && Object.prototype.hasOwnProperty.call(MECHANICS, id);
}

/** Default value for a parameter, scaled by difficulty (1 = gentle, 5 = brutal). */
export function defaultParam(mechanic, key, difficulty) {
  const spec = MECHANICS[mechanic].params[key];
  let t = (clamp(difficulty, 1, 5) - 1) / 4;
  if (EASIER_WHEN_HIGH.has(key)) t = 1 - t;
  const v = spec.min + (spec.max - spec.min) * t;
  return spec.integer ? Math.round(v) : Number(v.toFixed(3));
}

export function clampParam(mechanic, key, value) {
  const spec = MECHANICS[mechanic].params[key];
  const v = clamp(value, spec.min, spec.max);
  return spec.integer ? Math.round(v) : Number(v.toFixed(3));
}

/** Strip markup/control chars and collapse whitespace so text is safe for a banner. */
export function sanitizeText(value, maxLength) {
  if (typeof value !== 'string') return '';
  const cleaned = value
    .replace(/<[^>]*>/g, '')
    .replace(/[<>`{}\\]/g, '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (cleaned.length <= maxLength) return cleaned;
  return cleaned.slice(0, maxLength - 1).trimEnd() + '…';
}

/**
 * Validate an untrusted event object (e.g. LLM output).
 * Returns { ok: true, event } with every field clamped to safe values,
 * or { ok: false, error } when the mechanic is not on the allowlist.
 */
export function validateChaosEvent(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, error: 'event must be an object' };
  }
  const mechanic = typeof raw.mechanic === 'string' ? raw.mechanic.trim().toLowerCase() : '';
  if (!isMechanic(mechanic)) {
    return { ok: false, error: `unsupported mechanic: ${String(raw.mechanic).slice(0, 40)}` };
  }

  const difficultyNum = Number(raw.difficulty);
  const difficulty = Number.isFinite(difficultyNum)
    ? Math.round(clamp(difficultyNum, DIFFICULTY_RANGE.min, DIFFICULTY_RANGE.max))
    : 2;

  const durationNum = Number(raw.durationSeconds);
  const durationSeconds = Number.isFinite(durationNum)
    ? Number(clamp(durationNum, DURATION_RANGE.min, DURATION_RANGE.max).toFixed(1))
    : 7;

  const rawParams = raw.parameters && typeof raw.parameters === 'object' ? raw.parameters : {};
  const parameters = {};
  for (const key of Object.keys(MECHANICS[mechanic].params)) {
    const n = Number(rawParams[key]);
    parameters[key] =
      rawParams[key] !== undefined && rawParams[key] !== null && Number.isFinite(n)
        ? clampParam(mechanic, key, n)
        : defaultParam(mechanic, key, difficulty);
  }

  const name = sanitizeText(raw.name, NAME_MAX).toUpperCase();
  const description = sanitizeText(raw.description, DESCRIPTION_MAX);
  const taunt = sanitizeText(raw.taunt, TAUNT_MAX);

  return {
    ok: true,
    event: { name, description, taunt, mechanic, durationSeconds, difficulty, parameters },
  };
}
