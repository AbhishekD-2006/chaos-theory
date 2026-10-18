import 'dotenv/config';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createChaosDirector } from './aiProvider.js';
import { sanitizeGameState, sanitizeRecentEvents } from './requestValidation.js';

const PORT = Number(process.env.PORT ?? 8787);
const env = (k) => process.env[k]?.trim() || undefined;
const director = createChaosDirector({
  provider: env('AI_PROVIDER')?.toLowerCase(),
  apiKey: env('GEMINI_API_KEY'),
  model: env('GEMINI_MODEL') || 'gemma-4-26b-a4b-it',
  ollamaUrl: env('OLLAMA_URL') || 'http://127.0.0.1:11434',
  ollamaModel: env('OLLAMA_MODEL'),
  timeoutMs: Math.min(120000, Math.max(1000, Number(env('AI_TIMEOUT_MS')) || 10000)),
});

// Arena screenshots arrive as small JPEG data URLs; anything else is dropped.
const SNAPSHOT_RE = /^data:image\/jpeg;base64,([A-Za-z0-9+/]+={0,2})$/;
const SNAPSHOT_MAX_CHARS = 200_000;
function sanitizeSnapshot(raw) {
  if (typeof raw !== 'string' || raw.length > SNAPSHOT_MAX_CHARS) return undefined;
  return SNAPSHOT_RE.exec(raw)?.[1];
}

const app = express();
app.disable('x-powered-by');

// Tiny per-IP limiter so a stuck client can't burn through API quota.
const hits = new Map();
function rateLimit(req, res, next) {
  const now = Date.now();
  const key = req.ip ?? 'unknown';
  const recent = (hits.get(key) ?? []).filter((t) => now - t < 60_000);
  if (recent.length >= 30) return res.status(429).json({ error: 'rate_limited' });
  recent.push(now);
  hits.set(key, recent);
  next();
}

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    aiConfigured: director.configured,
    provider: director.provider,
    model: director.model,
    vision: director.configured,
    timeoutMs: director.timeoutMs,
  });
});

// Body parsing runs after the limiter so oversized/malformed bodies still count against the quota.
app.post('/api/chaos-event', rateLimit, express.json({ limit: '256kb' }), async (req, res) => {
  if (!director.configured) {
    return res.status(503).json({ error: 'ai_not_configured', message: 'No GEMINI_API_KEY or OLLAMA_MODEL on the server' });
  }
  const gameState = sanitizeGameState(req.body?.gameState);
  const recentEvents = sanitizeRecentEvents(req.body?.recentEvents);
  const snapshot = sanitizeSnapshot(req.body?.snapshot);
  const clientGone = new AbortController();
  res.on('close', () => {
    if (!res.writableFinished) clientGone.abort();
  });
  try {
    const { event, latencyMs, usedVision } = await director.generate(gameState, recentEvents, snapshot, clientGone.signal);
    res.json({ event, source: 'ai', provider: director.provider, model: director.model, latencyMs, vision: usedVision });
  } catch (err) {
    console.warn(`[chaos-director] ${err.code ?? 'error'}: ${err.message}`);
    if (clientGone.signal.aborted) return;
    res.status(502).json({ error: err.code ?? 'ai_request_failed' });
  }
});

const distDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist');
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir));
  app.get(/^\/(?!api\/).*/, (_req, res) => res.sendFile(path.join(distDir, 'index.html')));
}

app.listen(PORT, () => {
  console.log(
    `[chaos-theory] API on http://localhost:${PORT} — AI ${director.configured ? `configured (${director.provider}: ${director.model}, timeout ${director.timeoutMs}ms)` : 'not configured, clients use offline events'}`,
  );
});
