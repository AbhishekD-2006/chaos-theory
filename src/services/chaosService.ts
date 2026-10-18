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
  provider?: string;
  lastLatencyMs?: number;
}

const DEFAULT_CLIENT_TIMEOUT_MS = 6000;
const STALE_AFTER_MS = 30000;
const RETRY_BACKOFF_MS = 8000;

interface PendingRequest {
  controller: AbortController;
  startedAt: number;
  doneAt: number;
  done: boolean;
  event: ChaosEvent | null;
}

const ERROR_DETAIL: Record<string, string> = {
  ai_not_configured: 'No AI configured on the server (no Gemini key or Ollama model) — using the offline event library.',
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
  private clientTimeoutMs = DEFAULT_CLIENT_TIMEOUT_MS;
  private healthReady: Promise<void> | null = null;

  subscribe(fn: (s: AiStatus) => void): () => void {
    this.listeners.add(fn);
    fn(this.status);
    return () => this.listeners.delete(fn);
  }

  private setStatus(next: Partial<AiStatus>) {
    this.status = { ...this.status, ...next };
    for (const fn of this.listeners) fn(this.status);
  }

  checkHealth(): Promise<void> {
    this.healthReady = this.fetchHealth();
    return this.healthReady;
  }

  private async fetchHealth(): Promise<void> {
    try {
      const res = await fetch('/api/health', { signal: AbortSignal.timeout(2500) });
      const data = (await res.json()) as { aiConfigured?: boolean; model?: string | null; provider?: string | null; timeoutMs?: number };
      if (data.aiConfigured) {
        if (typeof data.timeoutMs === 'number' && Number.isFinite(data.timeoutMs)) {
          this.clientTimeoutMs = Math.min(125000, Math.max(2000, data.timeoutMs + 1500));
        }
        this.setStatus({ configured: true, model: data.model ?? undefined, provider: data.provider ?? undefined });
        if (this.status.mode !== 'online') this.setStatus({ mode: 'checking', detail: `Key found — waiting for first ${data.model} response…` });
      } else {
        this.setStatus({ mode: 'offline', configured: false, detail: ERROR_DETAIL.ai_not_configured });
      }
    } catch {
      this.setStatus({ mode: 'offline', configured: false, detail: ERROR_DETAIL.network });
    }
  }

  /** Drop (and abort) any in-flight or ready event so it can't leak into another round. */
  newRound() {
    this.pending?.controller.abort();
    this.pending = null;
  }

  /**
   * Start fetching the next AI event in the background (no-op if one is in flight).
   * `snapshot` lazily captures a small JPEG of the arena so the model can see the board.
   */
  prefetch(gameState: DirectorGameState, recent: ChaosEvent[], snapshot?: () => string | null) {
    if (this.status.configured === false) return;
    if (Date.now() < this.retryAfter) return;
    if (this.pending && !this.pending.done && Date.now() - this.pending.startedAt < this.clientTimeoutMs + 500) return;
    if (this.pending?.event && !this.isStale(this.pending)) return;

    const req: PendingRequest = { controller: new AbortController(), startedAt: Date.now(), doneAt: 0, done: false, event: null };
    this.pending = req;
    let image: string | null = null;
    try {
      image = snapshot?.() ?? null;
    } catch {
      image = null;
    }
    void this.requestAiEvent(gameState, recent, image, req.controller.signal).then((event) => {
      if (this.pending !== req) return;
      req.event = event;
      req.done = true;
      req.doneAt = Date.now();
    });
  }

  private isStale(p: PendingRequest) {
    return p.done && Date.now() - p.doneAt > STALE_AFTER_MS;
  }

  /** Returns the prefetched AI event if it's ready, otherwise an offline one. Never blocks. */
  takeEvent(rng: Rng, gameState: DirectorGameState, recent: ChaosEvent[]): ChaosEvent {
    const p = this.pending;
    if (p?.done) this.pending = null;
    if (p?.event && !this.isStale(p)) return p.event;
    return generateOfflineEvent(rng, gameState, recent);
  }

  private async requestAiEvent(
    gameState: DirectorGameState,
    recent: ChaosEvent[],
    snapshot: string | null,
    cancel: AbortSignal,
  ): Promise<ChaosEvent | null> {
    // Wait for /api/health so the timeout matches the server's (local models can be slow).
    await this.healthReady?.catch(() => undefined);
    if (cancel.aborted || this.status.configured === false) return null;
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, this.clientTimeoutMs);
    const onCancel = () => controller.abort();
    cancel.addEventListener('abort', onCancel, { once: true });
    try {
      const res = await fetch('/api/chaos-event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gameState,
          recentEvents: recent.slice(-5).map((e) => ({ mechanic: e.mechanic, name: e.name })),
          ...(snapshot ? { snapshot } : {}),
        }),
        signal: controller.signal,
      });
      const data = (await res.json().catch(() => ({}))) as {
        event?: unknown;
        model?: string;
        provider?: string;
        latencyMs?: number;
        vision?: boolean;
        error?: string;
      };
      if (cancel.aborted) return null;
      if (!res.ok) return this.fail(data.error ?? 'network');

      // Validate again on the client: the engine only ever runs allowlisted, clamped events.
      const result = validateChaosEvent(data.event);
      if (!result.ok) return this.fail('invalid_model_output');
      this.setStatus({
        mode: 'online',
        configured: true,
        model: data.model,
        provider: data.provider,
        lastLatencyMs: data.latencyMs,
        detail: `${data.model}${data.provider === 'ollama' ? ' (local, open-weight)' : ''} is ${data.vision ? 'watching the arena and ' : ''}directing the chaos (${data.latencyMs ?? '?'}ms).`,
      });
      const { taunt, ...rest } = result.event;
      return { ...rest, ...(taunt ? { taunt } : {}), id: nextEventId(), source: 'ai', model: data.model, vision: Boolean(data.vision) };
    } catch {
      if (cancel.aborted && !timedOut) return null;
      return this.fail(timedOut ? 'ai_timeout' : 'network');
    } finally {
      clearTimeout(timer);
      cancel.removeEventListener('abort', onCancel);
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
