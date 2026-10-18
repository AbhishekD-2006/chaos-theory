export interface LeaderboardEntry {
  score: number;
  survivalTime: number;
  date: string;
  title: string;
}

export interface Settings {
  muted: boolean;
  seenTutorial: boolean;
}

const LB_KEY = 'chaos-theory:leaderboard:v1';
const SETTINGS_KEY = 'chaos-theory:settings:v1';
const MAX_ENTRIES = 5;

function readJson(key: string): unknown {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage full or blocked (private mode) — the game still works without persistence.
  }
}

function isEntry(e: unknown): e is LeaderboardEntry {
  if (!e || typeof e !== 'object') return false;
  const o = e as Record<string, unknown>;
  return (
    typeof o.score === 'number' && Number.isFinite(o.score) && o.score >= 0 &&
    typeof o.survivalTime === 'number' && Number.isFinite(o.survivalTime) &&
    typeof o.date === 'string' && !Number.isNaN(Date.parse(o.date)) &&
    typeof o.title === 'string'
  );
}

export function loadLeaderboard(): LeaderboardEntry[] {
  const data = readJson(LB_KEY);
  if (!Array.isArray(data)) return [];
  return data
    .filter(isEntry)
    .map((e) => ({ ...e, title: e.title.slice(0, 60) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_ENTRIES);
}

/** Inserts a score and returns its 1-based rank, or null if it didn't make the top 5. */
export function saveScore(entry: LeaderboardEntry): number | null {
  const list = [...loadLeaderboard(), entry].sort((a, b) => b.score - a.score).slice(0, MAX_ENTRIES);
  writeJson(LB_KEY, list);
  const idx = list.indexOf(entry);
  return idx === -1 ? null : idx + 1;
}

export function bestScore(): number {
  return loadLeaderboard()[0]?.score ?? 0;
}

export function loadSettings(): Settings {
  const data = readJson(SETTINGS_KEY) as Partial<Settings> | null;
  return {
    muted: typeof data?.muted === 'boolean' ? data.muted : false,
    seenTutorial: typeof data?.seenTutorial === 'boolean' ? data.seenTutorial : false,
  };
}

export function saveSettings(s: Settings) {
  writeJson(SETTINGS_KEY, s);
}
