import { GoogleGenAI, Type } from '@google/genai';
import { MECHANICS, MECHANIC_IDS, DURATION_RANGE, DIFFICULTY_RANGE, NAME_MAX, DESCRIPTION_MAX, validateChaosEvent } from '../shared/chaosSchema.js';

const mechanicCatalog = MECHANIC_IDS.map((id) => {
  const params = Object.entries(MECHANICS[id].params)
    .map(([k, s]) => `${k} (${s.min}-${s.max}${s.integer ? ', integer' : ''}: ${s.doc})`)
    .join('; ');
  return `- ${id}: ${MECHANICS[id].effect}${params ? ` Parameters: ${params}.` : ' No parameters.'}`;
}).join('\n');

const SYSTEM_INSTRUCTION = `You are the CHAOS DIRECTOR of CHAOS THEORY, a top-down arcade survival game.
Each call you invent the NEXT chaos event: a funny, surprising, coherent name and a one-line dramatic description, plus a mechanic chosen ONLY from this list:
${mechanicCatalog}

Rules:
- "mechanic" must be exactly one id from the list above. Never invent mechanics, code, HTML or commands.
- "name": punchy, max ${NAME_MAX} characters, uppercase style. Theme it to the chosen mechanic so players understand what is about to happen.
- "description": max ${DESCRIPTION_MAX} characters, witty, hints at the effect.
- "durationSeconds": ${DURATION_RANGE.min}-${DURATION_RANGE.max}. "difficulty": integer ${DIFFICULTY_RANGE.min}-${DIFFICULTY_RANGE.max}.
- Scale difficulty to the player: higher score and survival time => harder; 1 life left => ease off; struggling players => more treasure_storm or slow_motion.
- Do not reuse a mechanic used in the last two events, and vary names from recent ones.
- Keep events fair: never combine maximum difficulty with the harshest parameters.
- Respond with JSON only.`;

const paramProperties = {};
for (const id of MECHANIC_IDS) {
  for (const key of Object.keys(MECHANICS[id].params)) {
    paramProperties[key] = { type: Type.NUMBER };
  }
}

const RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    name: { type: Type.STRING },
    description: { type: Type.STRING },
    mechanic: { type: Type.STRING, enum: [...MECHANIC_IDS] },
    durationSeconds: { type: Type.NUMBER },
    difficulty: { type: Type.INTEGER },
    parameters: { type: Type.OBJECT, properties: paramProperties },
  },
  required: ['name', 'description', 'mechanic', 'durationSeconds', 'difficulty', 'parameters'],
  propertyOrdering: ['mechanic', 'name', 'description', 'durationSeconds', 'difficulty', 'parameters'],
};

export class AiError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

export function createChaosDirector({ apiKey, model, timeoutMs }) {
  const configured = Boolean(apiKey);
  const client = configured ? new GoogleGenAI({ apiKey }) : null;

  async function generate(gameState, recentEvents) {
    if (!client) throw new AiError('ai_not_configured', 'GEMINI_API_KEY is not set');

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const started = Date.now();
    try {
      const config = {
        systemInstruction: SYSTEM_INSTRUCTION,
        responseMimeType: 'application/json',
        responseSchema: RESPONSE_SCHEMA,
        temperature: 1.1,
        maxOutputTokens: 400,
        abortSignal: controller.signal,
      };
      // Low latency matters more than deep reasoning for a banner-sized event.
      if (/2\.5-flash/.test(model)) config.thinkingConfig = { thinkingBudget: 0 };

      const response = await client.models.generateContent({
        model,
        contents: JSON.stringify({ gameState, recentEvents }),
        config,
      });

      let parsed;
      try {
        parsed = JSON.parse(response.text ?? '');
      } catch {
        throw new AiError('invalid_model_output', 'Model did not return valid JSON');
      }
      const result = validateChaosEvent(parsed);
      if (!result.ok) throw new AiError('invalid_model_output', result.error);
      return { event: result.event, latencyMs: Date.now() - started };
    } catch (err) {
      if (err instanceof AiError) throw err;
      if (controller.signal.aborted) throw new AiError('ai_timeout', `Model took longer than ${timeoutMs}ms`);
      throw new AiError('ai_request_failed', err?.message ? String(err.message).slice(0, 200) : 'Unknown error');
    } finally {
      clearTimeout(timer);
    }
  }

  return { configured, model, generate };
}
