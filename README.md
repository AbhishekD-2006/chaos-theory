# CHAOS THEORY

> **THE RULES ARE MADE UP. YOUR SURVIVAL ISN'T.**

CHAOS THEORY is a fast top-down arcade survival game where an AI **chaos director**, powered by the open-weight **Gemma 4** model, invents the rules mid-round. It works through the Gemini API or entirely on your own machine with Ollama. You dodge hazards, grab orbs and try to last 60 seconds while the arena keeps changing: the floor turns to lava, your controls flip, gold rains from the sky, the dance floor explodes on the beat.

The AI does more than write flavour text. Each event it creates is a structured, validated object that picks a real mechanic, a duration, a difficulty and tuning parameters, and the game engine runs it.

## What makes it different

- **Gemma 4 directs the gameplay, not a chat window.** The model chooses which mechanic comes next, how long it lasts, how hard it is and how it's tuned, based on your score, lives and how long you've survived.
- **Gemma looks at the arena.** Each request includes a small screenshot of the canvas. Gemma 4 is multimodal, so it can see where you are, where the orbs and hazards are, and choose an event to match. It also writes a taunt aimed at you, shown in the banner as **GEMMA SEES YOU**.
- **Open-weight and offline-friendly.** Run Gemma 4 locally with Ollama (no key, no cloud) or use it through the Gemini API.
- **Safe by construction.** The model can only choose mechanics from a strict allowlist. Every field is validated and clamped on the server *and* the client. Model output is never executed.
- **Works without AI.** With no AI configured, or when the model is slow or unreachable, a rule-based offline director takes over right away. The UI tells you which one wrote each event.
- **No assets needed.** Graphics are drawn with Canvas vector shapes, glow and particles. Sounds are generated with WebAudio.

## How to play

| Key | Action |
| --- | --- |
| `W A S D` / arrow keys | Move |
| `Space` | Dash (short invincibility, 1.4 s cooldown shown as a ring around you) |
| `Esc` (or `P`) | Pause / resume |
| `R` | Restart (while paused or on the game-over screen) |

- You have **3 lives** and **60 seconds**.
- **Green orbs** +10, **gold orbs** +30 (Treasure Storm orbs are worth more).
- **Pink spiky hazards** cost a life. A dashed ring shows where one will spawn ~0.9 s before it becomes dangerous.
- Passing close to a hazard without touching it gives a **CLOSE CALL +15**.
- Surviving a chaos event gives **+50**, or **+100** if you weren't hit during it. You also earn 2 points per second.
- Each chaos event is announced with a banner about 1.8 s before it starts. The HUD then shows what it does and how long it has left.
- At the end you get a performance title based on your actual stats (for example *"Physics Has Filed a Complaint"* for a flawless run).

## Supported chaos mechanics

| Mechanic id | In-game | Effect | Tunable parameters |
| --- | --- | --- | --- |
| `reverse_controls` | REVERSE DAY | Movement input is inverted on both axes | – |
| `lava_tiles` | FLOOR IS LAVA | Tiles blink orange for 1.1 s, then burn; touching a burning tile costs a life | `tileFraction`, `cycleSeconds` |
| `treasure_storm` | TREASURE STORM | Gold bonus orbs rain in and expire when the event ends | `orbCount`, `bonusMultiplier` |
| `chaos_magnet` | CHAOS MAGNET | You get pulled toward the nearest orb in range (shown as a tether line) while hazards home in on you | `strength`, `radius`, `hazardPull` |
| `giant_mode` | GIANT MODE | Your size and hitbox grow | `scale` |
| `speed_panic` | SPEED PANIC | You move faster and hazards spawn more often | `speedMultiplier`, `hazardRateMultiplier` |
| `slow_motion` | SLOW-MOTION DRAMA | The world slows down and your score multiplier goes up | `timeScale`, `scoreMultiplier` |
| `disco_apocalypse` | DISCO APOCALYPSE | Flashing rings appear on the floor and explode on the beat | `pulseInterval`, `zoneCount`, `zoneRadius` |

Safe ranges for every parameter are in [`shared/chaosSchema.js`](shared/chaosSchema.js), which both the server and the browser use.

## How the AI chaos director works

```
 game engine ──prefetch + arena JPEG──▶ POST /api/chaos-event ──▶ Gemma 4 (Gemini API or local Ollama)
      ▲                                              │
      │          extract JSON + validateChaosEvent() ◀─┘   (allowlist + clamping, server side)
      │                                              │
      └── takeEvent(): AI event ready? ──yes──▶ validate again on client ──▶ run mechanic
                               └──no──▶ offline generator (instant)
```

1. The client asks for the **next** event in the background: on the menu, at round start, and as each event begins. It attaches a 448×252 JPEG of the arena (about 10–20 KB), captured from the game canvas. The animation loop never waits on the network.
2. The Express server (`server/aiProvider.js`) sends Gemma 4 the instructions, a small game-state summary (score, lives, elapsed time, recent events) and the screenshot:
   - **Gemini API:** `@google/genai` with model `gemma-4-26b-a4b-it` by default. The instructions go in the prompt, and the JSON object is extracted from the reply.
   - **Ollama:** `/api/chat` with the image attached and a JSON-schema `format` that limits `mechanic` to the allowed ids.
3. The server rejects screenshots that aren't small base64 JPEG data URLs.
4. The response goes through `validateChaosEvent()`, which rejects unknown mechanics, clamps duration to 5–10 s and difficulty to 1–5, clamps or fills every parameter, drops unknown keys and strips markup from the name, description and taunt.
5. When an event is due, the engine uses the AI event if one is ready. An AI event is discarded if it has been waiting more than 30 s since it arrived. Otherwise the engine calls the **offline generator** straight away. That generator picks from the same mechanics, avoids repeating the last two, scales difficulty with your progress, randomizes parameters and uses a built-in library of names and descriptions.
6. The **AI indicator** shows **AI ONLINE** only after a real successful model response. Otherwise it shows **OFFLINE MODE** (or **CONNECTING…** while the first request is in flight). Each event banner and log entry is tagged **AI DIRECTOR · model · VISION** or **OFFLINE LIBRARY**.

## Setup

Requirements: **Node.js 20+**.

```bash
npm install
npm run dev          # Vite on http://localhost:5173 + API on http://localhost:8787 (proxied as /api)
```

Open http://localhost:5173 and press **PLAY CHAOS**. You don't need an API key; without one the game runs in offline mode.

### Enabling the Gemma 4 chaos director (optional)

Copy the example config and choose **one** option:

```bash
cp .env.example .env
```

**Option A: Gemma 4 locally with Ollama** (open weights, no API key)

```bash
# install Ollama: https://ollama.com/download
ollama pull gemma4:e2b-it-qat        # ~4.3 GB, text + image
# in .env:
OLLAMA_MODEL=gemma4:e2b-it-qat
AI_TIMEOUT_MS=90000                  # CPU-only machines are slow; a GPU is much faster
```

**Option B: Gemma 4 through the Gemini API**

```bash
# in .env:
GEMINI_API_KEY=your-key-here         # https://aistudio.google.com/apikey
GEMINI_MODEL=gemma-4-26b-a4b-it      # or gemma-4-31b-it
AI_TIMEOUT_MS=10000
```

Restart `npm run dev`. Keys and model settings are read **only by the Node server** and never sent to the browser. Don't add a `VITE_` prefix. If both options are set, the Gemini API is used unless you set `AI_PROVIDER=ollama`. You can check the configuration with `curl localhost:8787/api/health`.

### Production build

```bash
npm run build        # type-check + Vite build into dist/
npm start            # Express serves dist/ and the API on http://localhost:8787
```

### Other scripts

```bash
npm run lint         # ESLint
npm run typecheck    # tsc --noEmit
npm test             # node:test unit tests for event validation
```

**Reproducible runs:** add `?seed=12345` to the URL so the same seed drives orb, hazard and offline-event randomness. The seed is shown on the game-over screen. AI responses and frame timing can still differ between runs.

## Tech stack

- React 18 + Vite 5 + TypeScript for the UI and HUD overlays
- HTML Canvas 2D with a small custom engine (`requestAnimationFrame`, fixed 120 Hz simulation step, delta-time movement)
- Node.js + Express for the AI endpoint: **Gemma 4** via `@google/genai` (Gemini API) or Ollama's local HTTP API
- WebAudio for synthesized sound effects, localStorage for the top-5 leaderboard and settings

```
src/
  components/   MainMenu, GameHUD, EventBanner, GameOver, Leaderboard, HowToPlay, PauseMenu
  game/         GameEngine, Player, Collectibles, Hazards, EventManager, Collision, constants,
                offlineGenerator, mechanics (presentation + offline library), audio, storage, titles
  services/     chaosService (prefetch, timeout, fallback, AI status)
shared/         chaosSchema.js — mechanic allowlist, safe ranges, validation (+ tests)
server/         index.js (Express), aiProvider.js (Gemma 4 via Gemini API / Ollama), requestValidation.js
```

## Screenshots

_No screenshots yet._ To add some, run the game, capture the menu, an event banner and the game-over screen, save them as `docs/screenshots/*.png`, and link them here:

```md
![Main menu](docs/screenshots/menu.png)
```

## Known limitations

- Keyboard only. There are no touch controls yet, so phones and tablets can't play.
- Single player. The local two-player mode is not implemented.
- The AI picks and tunes events but can't create new mechanics. That's deliberate: only the 8 allowlisted mechanics exist.
- Local Gemma 4 on a CPU-only machine takes tens of seconds per event, while events come every ~10 s. On slow hardware, many events will come from the offline library and are labelled as such. A GPU or the Gemini API is needed for every event to come from Gemma.
- The Gemini API path for Gemma 4 has not been tested end-to-end yet (it needs a key). The local Ollama path has been tested.
- How much the vision input changes each decision depends on the model. A small model like E2B tends to make general comments rather than specific ones.
- The leaderboard is per-browser (localStorage). There are no accounts and no global scores.
- Fonts load from Google Fonts. Offline, the UI falls back to system fonts.

## Hackathon tracks

- **Best Open-Source AI Project:** the core game loop is directed by the open-weight Gemma 4 model, which can run entirely locally through Ollama. The code is MIT-licensed.
- **Best Use of Gemma 4:** a multimodal use of Gemma 4. It reads both the game state (text) and a live screenshot of the arena (image) to direct the gameplay, through the Gemini API or a local runner.

## License

[MIT](LICENSE)
