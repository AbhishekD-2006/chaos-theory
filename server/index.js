import 'dotenv/config';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createChaosDirector } from './aiProvider.js';
import { sanitizeGameState, sanitizeRecentEvents } from './requestValidation.js';

const PORT = Number(process.env.PORT ?? 8787);
const director = createChaosDirector({
  apiKey: process.env.GEMINI_API_KEY?.trim(),
  model: process.env.GEMINI_MODEL?.trim() || 'gemini-2.5-flash',
  timeoutMs: Math.min(15000, Math.max(1000, Number(process.env.AI_TIMEOUT_MS) || 4000)),
});

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '8kb' }));

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
  res.json({ ok: true, aiConfigured: director.configured, model: director.configured ? director.model : null });
});

app.post('/api/chaos-event', rateLimit, async (req, res) => {
  if (!director.configured) {
    return res.status(503).json({ error: 'ai_not_configured', message: 'No GEMINI_API_KEY on the server' });
  }
  const gameState = sanitizeGameState(req.body?.gameState);
  const recentEvents = sanitizeRecentEvents(req.body?.recentEvents);
  try {
    const { event, latencyMs } = await director.generate(gameState, recentEvents);
    res.json({ event, source: 'ai', model: director.model, latencyMs });
  } catch (err) {
    console.warn(`[chaos-director] ${err.code ?? 'error'}: ${err.message}`);
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
    `[chaos-theory] API on http://localhost:${PORT} — AI ${director.configured ? `configured (${director.model})` : 'not configured, clients use offline events'}`,
  );
});
