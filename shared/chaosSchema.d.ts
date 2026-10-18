export interface ParamSpec {
  min: number;
  max: number;
  integer?: boolean;
  doc: string;
}

export interface MechanicSpec {
  effect: string;
  params: Record<string, ParamSpec>;
}

export type MechanicId =
  | 'reverse_controls'
  | 'lava_tiles'
  | 'treasure_storm'
  | 'chaos_magnet'
  | 'giant_mode'
  | 'speed_panic'
  | 'slow_motion'
  | 'disco_apocalypse';

export interface ValidatedChaosEvent {
  name: string;
  description: string;
  mechanic: MechanicId;
  durationSeconds: number;
  difficulty: number;
  parameters: Record<string, number>;
}

export type ValidationResult =
  | { ok: true; event: ValidatedChaosEvent }
  | { ok: false; error: string };

export const DURATION_RANGE: Readonly<{ min: number; max: number }>;
export const DIFFICULTY_RANGE: Readonly<{ min: number; max: number }>;
export const NAME_MAX: number;
export const DESCRIPTION_MAX: number;
export const MECHANICS: Readonly<Record<MechanicId, MechanicSpec>>;
export const MECHANIC_IDS: readonly MechanicId[];
export function isMechanic(id: unknown): id is MechanicId;
export function defaultParam(mechanic: MechanicId, key: string, difficulty: number): number;
export function clampParam(mechanic: MechanicId, key: string, value: number): number;
export function sanitizeText(value: unknown, maxLength: number): string;
export function validateChaosEvent(raw: unknown): ValidationResult;
