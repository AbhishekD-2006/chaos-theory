import { validateChaosEvent } from '../../shared/chaosSchema';
import { generateOfflineEvent, nextEventId, type DirectorGameState } from '../game/offlineGenerator';
import type { Rng } from '../game/rng';
import type { ChaosEvent } from '../game/types';

export type AiMode = 'checking' | 'online' | 'offline';

export interface AiStatus {
  mode: AiMode;
  detail: string;
  configured: boolean | null;
  model?: string;
  lastLatencyMs?: number;
}

const CLIENT_TIMEOUT_MS = 6000;
const STALE_AFTER_MS = 30000;
const RETRY_BACKOFF_MS = 8000;

interface PendingRequest {
  startedAt: number;
  done: boolean;
  event: ChaosEvent | null;
}

const ERROR_DETAIL: Record<string, string> = {
  ai_not_configured: 'No API key on the server — using the offline event library.',
  ai_timeout: 'AI was too slow — using offline events for now.',
  invalid_model_output: 'AI returned an invalid event — using offline events.',
  rate_limited: 'AI rate-limited — using offline events.',
  network: 'Server unreachable — using the offline event library.',
};

/**
 * Talks to the server-side chaos director. Requests are prefetched during gameplay
 * so the engine never waits on the network; if nothing valid is ready when an event
 * is due, the offline generator is used instantly.
 */
class ChaosService {
  status: AiStatus = { mode: 'checking', detail: 'Contacting the chaos director…', configured: null };
  private listeners = new Set<(s: AiStatus) => void>();
  private pending: PendingRequest | null = null;
  private retryAfter = 0;

  subscribe(fn: (s: AiStatus) => void): () => void {
    this.listeners.add(fn);
    fn(this.status);
    return () => this.listeners.delete(fn);
  }

  private setStatus(next: Partial<AiStatus>) {
    this.status = { ...this.status, ...next };
    for (const fn of this.listeners) fn(this.status);
  }

  async checkHealth(): Promise<void> {
    try {
      const res = await fetch('/api/health', { signal: AbortSignal.timeout(2500) });
      const data = (await res.json()) as { aiConfigured?: boolean; model?: string | null };
      if (data.aiConfigured) {
        this.setStatus({ configured: true, model: data.model ?? undefined });
        if (this.status.mode !== 'online') this.setStatus({ mode: 'checking', detail: `Key found — waiting for first ${data.model} response…` });
      } else {
        this.setStatus({ mode: 'offline', configured: false, detail: ERROR_DETAIL.ai_not_configured });
      }
    } catch {
      this.setStatus({ mode: 'offline', configured: false, detail: ERROR_DETAIL.network });
    }
  }

  /** Start fetching the next AI event in the background (no-op if one is in flight). */
  prefetch(gameState: DirectorGameState, recent: ChaosEvent[]) {
    if (this.status.configured === false) return;
    if (Date.now() < this.retryAfter) return;
    if (this.pending && !this.pending.done && Date.now() - this.pending.startedAt < CLIENT_TIMEOUT_MS + 500) return;
    if (this.pending?.event && Date.now() - this.pending.startedAt < STALE_AFTER_MS) return;

    const req: PendingRequest = { startedAt: Date.now(), done: false, event: null };
    this.pending = req;
    void this.requestAiEvent(gameState, recent).then((event) => {
      req.event = event;
      req.done = true;
    });
  }

  /** Returns the prefetched AI event if it's ready, otherwise an offline one. Never blocks. */
  takeEvent(rng: Rng, gameState: DirectorGameState, recent: ChaosEvent[]): ChaosEvent {
    const p = this.pending;
    if (p?.done) this.pending = null;
    if (p?.event && Date.now() - p.startedAt < STALE_AFTER_MS) return p.event;
    return generateOfflineEvent(rng, gameState, recent);
  }

  private async requestAiEvent(gameState: DirectorGameState, recent: ChaosEvent[]): Promise<ChaosEvent | null> {
    try {
      const res = await fetch('/api/chaos-event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gameState,
          recentEvents: recent.slice(-5).map((e) => ({ mechanic: e.mechanic, name: e.name })),
        }),
        signal: AbortSignal.timeout(CLIENT_TIMEOUT_MS),
      });
      const data = (await res.json().catch(() => ({}))) as { event?: unknown; model?: string; latencyMs?: number; error?: string };
      if (!res.ok) return this.fail(data.error ?? 'network');

      // Validate again on the client: the engine only ever runs allowlisted, clamped events.
      const result = validateChaosEvent(data.event);
      if (!result.ok) return this.fail('invalid_model_output');
      this.setStatus({
        mode: 'online',
        configured: true,
        model: data.model,
        lastLatencyMs: data.latencyMs,
        detail: `${data.model} is directing the chaos (${data.latencyMs ?? '?'}ms).`,
      });
      return { ...result.event, id: nextEventId(), source: 'ai', model: data.model };
    } catch (err) {
      const timedOut = err instanceof DOMException && (err.name === 'TimeoutError' || err.name === 'AbortError');
      return this.fail(timedOut ? 'ai_timeout' : 'network');
    }
  }

  private fail(code: string): null {
    if (code === 'ai_not_configured') {
      this.setStatus({ mode: 'offline', configured: false, detail: ERROR_DETAIL.ai_not_configured });
    } else {
      this.retryAfter = Date.now() + RETRY_BACKOFF_MS;
      this.setStatus({ mode: 'offline', detail: ERROR_DETAIL[code] ?? 'AI request failed — using offline events.' });
    }
    return null;
  }
}

export const chaosService = new ChaosService();
