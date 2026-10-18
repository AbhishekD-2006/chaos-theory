import type { MechanicId } from '../../shared/chaosSchema';

export type Mechanic = MechanicId;
export type EventSource = 'ai' | 'offline';

export interface ChaosEvent {
  id: string;
  name: string;
  description: string;
  mechanic: Mechanic;
  durationSeconds: number;
  difficulty: number;
  parameters: Record<string, number>;
  source: EventSource;
  model?: string;
  /** Model one-liner aimed at the player (AI events only). */
  taunt?: string;
  /** True when the model was shown an arena screenshot for this event. */
  vision?: boolean;
}

export type GameState = 'MENU' | 'COUNTDOWN' | 'PLAYING' | 'EVENT_ANNOUNCEMENT' | 'PAUSED' | 'GAME_OVER';

export interface RoundStats {
  score: number;
  survivalTime: number;
  orbsCollected: number;
  bonusOrbs: number;
  eventsSurvived: number;
  livesLost: number;
  nearMisses: number;
  dashes: number;
  won: boolean;
  hitsBy: Partial<Record<string, number>>;
}

export interface GameSummary {
  stats: RoundStats;
  title: string;
  subtitle: string;
  isNewBest: boolean;
  bestScore: number;
  rank: number | null;
}

export interface ActiveEventView {
  event: ChaosEvent;
  phase: 'warning' | 'active';
  remaining: number;
  total: number;
}

export interface HudSnapshot {
  state: GameState;
  score: number;
  lives: number;
  timeLeft: number;
  countdown: number;
  dashCharge: number;
  scoreMultiplier: number;
  activeEvent: ActiveEventView | null;
  history: ChaosEvent[];
  summary: GameSummary | null;
  seed: number;
}

export interface Modifiers {
  reverse: boolean;
  speedMul: number;
  hazardRateMul: number;
  worldTimeScale: number;
  scoreMul: number;
  playerScale: number;
  magnet: { strength: number; radius: number; hazardPull: number } | null;
}

export interface InputState {
  x: number;
  y: number;
  dash: boolean;
}

export interface Vec {
  x: number;
  y: number;
}
