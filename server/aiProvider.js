import { GoogleGenAI, Type } from '@google/genai';
import {
  MECHANICS,
  MECHANIC_IDS,
  DURATION_RANGE,
  DIFFICULTY_RANGE,
  NAME_MAX,
  DESCRIPTION_MAX,
  TAUNT_MAX,
  validateChaosEvent,
} from '../shared/chaosSchema.js';

const mechanicCatalog = MECHANIC_IDS.map((id) => {
  const params = Object.entries(MECHANICS[id].params)
    .map(([k, s]) => `${k} (${s.min}-${s.max}${s.integer ? ', integer' : ''}: ${s.doc})`)
    .join('; ');
  return `- ${id}: ${MECHANICS[id].effect}${params ? ` Parameters: ${params}.` : ' No parameters.'}`;
}).join('\n');

export const SYSTEM_INSTRUCTION = `You are the CHAOS DIRECTOR of CHAOS THEORY, a top-down arcade survival game.
Each call you invent the NEXT chaos event: a funny, surprising, coherent name and a one-line dramatic description, plus a mechanic chosen ONLY from this list:
${mechanicCatalog}

You may also receive a screenshot of the arena. In it: the player is the cyan circle with a lime ring, green and gold dots are orbs (points), pink spiky stars are hazards, orange tiles are lava, glowing rings are disco blast zones.
Use what you SEE to choose: e.g. orbs clustered far away => chaos_magnet or treasure_storm; player boxed in by hazards => something survivable; player cruising in empty space => lava_tiles, speed_panic or disco_apocalypse.

Rules:
- "mechanic" must be exactly one id from the list above. Never invent mechanics, code, HTML or commands.
- "name": punchy, max ${NAME_MAX} characters, uppercase style. Theme it to the chosen mechanic so players understand what is about to happen.
- "description": max ${DESCRIPTION_MAX} characters, witty, hints at the effect.
- "taunt": max ${TAUNT_MAX} characters, a cheeky one-liner to the player that references something specific you see in the screenshot (where they are, nearby hazards, orbs). If there is no screenshot, taunt them about their score or lives.
- "durationSeconds": ${DURATION_RANGE.min}-${DURATION_RANGE.max}. "difficulty": integer ${DIFFICULTY_RANGE.min}-${DIFFICULTY_RANGE.max}.
- Scale difficulty to the player: higher score and survival time => harder; 1 life left => ease off; struggling players => more treasure_storm or slow_motion.
- Do not reuse a mechanic used in the last two events, and vary names from recent ones.
- Keep events fair: never combine maximum difficulty with the harshest parameters.
- Respond with ONE JSON object only, no markdown, with keys: mechanic, name, description, taunt, durationSeconds, difficulty, parameters.`;

const paramProperties = {};
for (const id of MECHANIC_IDS) {
  for (const key of Object.keys(MECHANICS[id].params)) paramProperties[key] = { type: 'number' };
}

/** Plain JSON Schema (used by Ollama structured outputs). */
const JSON_SCHEMA = {
  type: 'object',
  properties: {
    mechanic: { type: 'string', enum: [...MECHANIC_IDS] },
    name: { type: 'string' },
    description: { type: 'string' },
    taunt: { type: 'string' },
    durationSeconds: { type: 'number' },
    difficulty: { type: 'integer' },
    parameters: { type: 'object', properties: paramProperties },
  },
  required: ['mechanic', 'name', 'description', 'taunt', 'durationSeconds', 'difficulty', 'parameters'],
};

/** Gemini SDK schema (only used for Gemini-family models that support controlled JSON output). */
const GENAI_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    mechanic: { type: Type.STRING, enum: [...MECHANIC_IDS] },
    name: { type: Type.STRING },
    description: { type: Type.STRING },
    taunt: { type: Type.STRING },
    durationSeconds: { type: Type.NUMBER },
    difficulty: { type: Type.INTEGER },
    parameters: {
      type: Type.OBJECT,
      properties: Object.fromEntries(Object.keys(paramProperties).map((k) => [k, { type: Type.NUMBER }])),
    },
  },
  required: JSON_SCHEMA.required,
  propertyOrdering: ['mechanic', 'name', 'description', 'taunt', 'durationSeconds', 'difficulty', 'parameters'],
};

export class AiError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

/**
 * Pull the first JSON object out of free-form model text (handles ```json fences,
 * leading chatter and thinking blocks). Returns undefined if none parses.
 */
export function extractJsonObject(text) {
  if (typeof text !== 'string') return undefined;
  const cleaned = text.replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/```(?:json)?/gi, '');
  for (let start = cleaned.indexOf('{'); start !== -1; start = cleaned.indexOf('{', start + 1)) {
    let depth = 0;
    let inString = false;
    for (let i = start; i < cleaned.length; i++) {
      const ch = cleaned[i];
      if (inString) {
        if (ch === '\\') i++;
        else if (ch === '"') inString = false;
      } else if (ch === '"') inString = true;
      else if (ch === '{') depth++;
      else if (ch === '}' && --depth === 0) {
        try {
          return JSON.parse(cleaned.slice(start, i + 1));
        } catch {
          break;
        }
      }
    }
  }
  return undefined;
}

function userPrompt(gameState, recentEvents, hasImage) {
  return `${hasImage ? 'The attached image is the arena right now.\n' : 'No screenshot this time.\n'}Game state: ${JSON.stringify({ gameState, recentEvents })}`;
}

function geminiProvider({ apiKey, model }) {
  const client = new GoogleGenAI({ apiKey });
  // Gemma models on the Gemini API: instructions go in the prompt and JSON is extracted from text.
  // Gemini models additionally get system instructions + schema-constrained JSON.
  const isGemma = /gemma/i.test(model);
  return async function call({ gameState, recentEvents, imageBase64, signal }) {
    const parts = [];
    if (isGemma) parts.push({ text: SYSTEM_INSTRUCTION });
    if (imageBase64) parts.push({ inlineData: { mimeType: 'image/jpeg', data: imageBase64 } });
    parts.push({ text: userPrompt(gameState, recentEvents, Boolean(imageBase64)) });
    const config = { temperature: 1.0, maxOutputTokens: 600, abortSignal: signal };
    if (!isGemma) {
      config.systemInstruction = SYSTEM_INSTRUCTION;
      config.responseMimeType = 'application/json';
      config.responseSchema = GENAI_SCHEMA;
      if (/2\.5-flash/.test(model)) config.thinkingConfig = { thinkingBudget: 0 };
    }
    const response = await client.models.generateContent({ model, contents: [{ role: 'user', parts }], config });
    return response.text ?? '';
  };
}

function ollamaProvider({ baseUrl, model }) {
  return async function call({ gameState, recentEvents, imageBase64, signal }) {
    const userMsg = { role: 'user', content: userPrompt(gameState, recentEvents, Boolean(imageBase64)) };
    if (imageBase64) userMsg.images = [imageBase64];
    const res = await fetch(`${baseUrl.replace(/\/$/, '')}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal,
      body: JSON.stringify({
        model,
        stream: false,
        think: false,
        format: JSON_SCHEMA,
        options: { temperature: 1.0, num_predict: 400 },
        messages: [{ role: 'system', content: SYSTEM_INSTRUCTION }, userMsg],
      }),
    });
    if (!res.ok) throw new Error(`Ollama HTTP ${res.status}: ${(await res.text()).slice(0, 160)}`);
    const data = await res.json();
    return data?.message?.content ?? '';
  };
}

/**
 * Picks the provider from config:
 *  - GEMINI_API_KEY set           -> Gemini API (default model: Gemma 4 26B A4B)
 *  - else OLLAMA_MODEL set        -> local Ollama (e.g. gemma4:e2b-it-qat), fully open-weight, no key
 *  - neither                      -> not configured; clients use the offline generator
 */
export function createChaosDirector({ provider, apiKey, model, ollamaUrl, ollamaModel, timeoutMs }) {
  let kind = null;
  let call = null;
  let activeModel = null;
  const wantOllama = provider === 'ollama' || (provider !== 'gemini' && !apiKey && ollamaModel);
  if (wantOllama && ollamaModel) {
    kind = 'ollama';
    activeModel = ollamaModel;
    call = ollamaProvider({ baseUrl: ollamaUrl, model: ollamaModel });
  } else if (apiKey && provider !== 'ollama') {
    kind = 'gemini';
    activeModel = model;
    call = geminiProvider({ apiKey, model });
  }

  async function generate(gameState, recentEvents, imageBase64, cancelSignal) {
    if (!call) throw new AiError('ai_not_configured', 'No AI provider configured');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    // Stop paying for (or queueing behind) a generation nobody is waiting for any more.
    const onCancel = () => controller.abort();
    cancelSignal?.addEventListener('abort', onCancel, { once: true });
    const started = Date.now();
    try {
      const text = await call({ gameState, recentEvents, imageBase64, signal: controller.signal });
      const parsed = extractJsonObject(text);
      if (parsed === undefined) throw new AiError('invalid_model_output', `No JSON object in model output: ${text.slice(0, 120)}`);
      const result = validateChaosEvent(parsed);
      if (!result.ok) throw new AiError('invalid_model_output', result.error);
      return { event: result.event, latencyMs: Date.now() - started, usedVision: Boolean(imageBase64) };
    } catch (err) {
      if (err instanceof AiError) throw err;
      if (cancelSignal?.aborted) throw new AiError('client_gone', 'Client disconnected');
      if (controller.signal.aborted) throw new AiError('ai_timeout', `Model took longer than ${timeoutMs}ms`);
      throw new AiError('ai_request_failed', err?.message ? String(err.message).slice(0, 200) : 'Unknown error');
    } finally {
      clearTimeout(timer);
      cancelSignal?.removeEventListener('abort', onCancel);
    }
  }

  return { configured: Boolean(call), provider: kind, model: activeModel, timeoutMs, generate };
}
