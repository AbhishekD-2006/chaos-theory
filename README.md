# CHAOS THEORY

> **THE RULES ARE MADE UP. YOUR SURVIVAL ISN'T.**

CHAOS THEORY is a fast top-down arcade survival game where an AI **chaos director** invents the rules mid-round. You dodge hazards, grab orbs and try to last 60 seconds while the arena keeps changing: the floor turns to lava, your controls flip, gold rains from the sky, the dance floor explodes on the beat.

The AI does more than write flavour text. Each event it creates is a structured, validated object that picks a real mechanic, a duration, a difficulty and tuning parameters, and the game engine runs it.

## What makes it different

- **The AI directs the gameplay, not a chat window.** The model chooses which mechanic comes next and how hard it is, based on your score, lives and how long you've survived.
- **Safe by construction.** The model can only choose mechanics from a strict allowlist. Every field is validated and clamped on the server *and* the client. Model output is never executed.
- **Works without AI.** With no API key, or when the AI is slow or unreachable, a rule-based offline director takes over right away. The UI tells you which one wrote each event.
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
 game engine ──prefetch (during gameplay)──▶ POST /api/chaos-event ──▶ Gemini (JSON schema)
      ▲                                              │
      │                       validateChaosEvent() ◀─┘   (allowlist + clamping, server side)
      │                                              │
      └── takeEvent(): AI event ready? ──yes──▶ validate again on client ──▶ run mechanic
                               └──no──▶ offline generator (instant)
```

1. The client asks for the **next** event in the background: on the menu, at round start, and as each event begins. The animation loop never waits on the network.
2. The Express server (`server/`) sends a small game-state summary (score, lives, elapsed time, recent events) to the model. It uses the Google Gen AI SDK (`@google/genai`) with structured JSON output (`responseSchema` with an enum of allowed mechanics).
3. The response goes through `validateChaosEvent()`, which rejects unknown mechanics, clamps duration to 5–10 s and difficulty to 1–5, clamps or fills every parameter, drops unknown keys and strips markup from text.
4. When an event is due, the engine uses the AI event if one is ready and fresh. Otherwise it calls the **offline generator** straight away. That generator picks from the same mechanics, avoids repeating the last two, scales difficulty with your progress (gentler events when you're on your last life), randomizes parameters and uses a built-in library of names and descriptions.
5. The **AI indicator** shows **AI ONLINE** only after a real successful model response. Otherwise it shows **OFFLINE MODE** (or **CONNECTING…** while the first request is in flight). Each event banner and log entry is tagged **AI DIRECTOR · model** or **OFFLINE LIBRARY**.

## Setup

Requirements: **Node.js 20+**.

```bash
npm install
npm run dev          # Vite on http://localhost:5173 + API on http://localhost:8787 (proxied as /api)
```

Open http://localhost:5173 and press **PLAY CHAOS**. You don't need an API key; the game runs in offline mode.

### Enabling the AI director (optional)

```bash
cp .env.example .env
# then edit .env:
GEMINI_API_KEY=your-key-here        # https://aistudio.google.com/apikey
GEMINI_MODEL=gemini-2.5-flash       # any Gemini model your key can use
AI_TIMEOUT_MS=4000
```

Restart `npm run dev`. The key is read **only by the Node server** and never sent to the browser. Don't add a `VITE_` prefix to it. You can check the configuration with `curl localhost:8787/api/health`.

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
- Node.js + Express for the AI endpoint, using `@google/genai`
- WebAudio for synthesized sound effects, localStorage for the top-5 leaderboard and settings

```
src/
  components/   MainMenu, GameHUD, EventBanner, GameOver, Leaderboard, HowToPlay, PauseMenu
  game/         GameEngine, Player, Collectibles, Hazards, EventManager, Collision, constants,
                offlineGenerator, mechanics (presentation + offline library), audio, storage, titles
  services/     chaosService (prefetch, timeout, fallback, AI status)
shared/         chaosSchema.js — mechanic allowlist, safe ranges, validation (+ tests)
server/         index.js (Express), aiProvider.js (Gemini), requestValidation.js
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
- If the AI is slower than the gap between events, that event comes from the offline library. The late AI event is used for the next slot if it's still fresh (under 30 s).
- The leaderboard is per-browser (localStorage). There are no accounts and no global scores.
- Fonts load from Google Fonts. Offline, the UI falls back to system fonts.

## License

[MIT](LICENSE)
