import { useCallback, useEffect, useRef, useState } from 'react';
import { EventBanner } from './components/EventBanner';
import { GameHUD } from './components/GameHUD';
import { GameOver } from './components/GameOver';
import { HowToPlay } from './components/HowToPlay';
import { MainMenu } from './components/MainMenu';
import { PauseMenu } from './components/PauseMenu';
import { sound } from './game/audio';
import { ARENA_H, ARENA_W, ROUND_SECONDS, START_LIVES } from './game/constants';
import { GameEngine } from './game/GameEngine';
import { loadLeaderboard, loadSettings, saveSettings, type LeaderboardEntry, type Settings } from './game/storage';
import type { HudSnapshot } from './game/types';
import { chaosService, type AiStatus } from './services/chaosService';

function seedFromUrl(): number | undefined {
  const raw = new URLSearchParams(window.location.search).get('seed');
  const n = raw === null ? NaN : Number(raw);
  return Number.isInteger(n) && n >= 0 ? n : undefined;
}

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<GameEngine | null>(null);
  const [snap, setSnap] = useState<HudSnapshot | null>(null);
  const [ai, setAi] = useState<AiStatus>(chaosService.status);
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>(loadLeaderboard);
  const [howTo, setHowTo] = useState<{ open: boolean; thenPlay: boolean }>({ open: false, thenPlay: false });
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const engine = new GameEngine(canvasRef.current!, { seed: seedFromUrl(), onSnapshot: setSnap });
    engineRef.current = engine;
    if (import.meta.env.DEV) (window as unknown as { __chaos?: GameEngine }).__chaos = engine;
    return () => {
      engine.destroy();
      engineRef.current = null;
    };
  }, []);

  useEffect(() => {
    sound.setMuted(settings.muted);
    saveSettings(settings);
  }, [settings]);

  useEffect(() => {
    const unsubscribe = chaosService.subscribe(setAi);
    // Warm up the director on the menu so the first event can be AI-generated.
    void chaosService.checkHealth().then(() =>
      chaosService.prefetch(
        { score: 0, lives: START_LIVES, elapsedSeconds: 0, timeLeftSeconds: ROUND_SECONDS, eventsSurvived: 0, livesLostRecently: 0 },
        [],
      ),
    );
    return unsubscribe;
  }, []);

  useEffect(() => {
    const fit = () => {
      const s = Math.min(window.innerWidth / ARENA_W, window.innerHeight / ARENA_H);
      setScale(s);
      engineRef.current?.setResolution(s * (window.devicePixelRatio || 1));
    };
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, []);

  const state = snap?.state ?? 'MENU';

  useEffect(() => {
    if (state === 'GAME_OVER' || state === 'MENU') setLeaderboard(loadLeaderboard());
  }, [state]);

  const play = useCallback(() => {
    sound.unlock();
    sound.play('click');
    if (!settings.seenTutorial) {
      setHowTo({ open: true, thenPlay: true });
      return;
    }
    engineRef.current?.startGame();
  }, [settings.seenTutorial]);

  const closeHowTo = useCallback(
    (start: boolean) => {
      setHowTo({ open: false, thenPlay: false });
      setSettings((s) => ({ ...s, seenTutorial: true }));
      if (start) engineRef.current?.startGame();
    },
    [],
  );

  const toggleMute = useCallback(() => {
    sound.unlock();
    setSettings((s) => ({ ...s, muted: !s.muted }));
  }, []);

  const engine = engineRef.current;
  const best = leaderboard[0]?.score ?? 0;

  return (
    <div className="app">
      <div
        className="stage"
        style={{ width: ARENA_W, height: ARENA_H, transform: `translate(-50%, -50%) scale(${scale})` }}
      >
        <canvas ref={canvasRef} className="arena" aria-label="Game arena" />
        {snap && state !== 'MENU' && state !== 'GAME_OVER' && <GameHUD snap={snap} ai={ai} />}
        {snap?.activeEvent?.phase === 'warning' && state !== 'PAUSED' && <EventBanner key={snap.activeEvent.event.id} view={snap.activeEvent} />}
      </div>

      {state === 'MENU' && !howTo.open && (
        <MainMenu
          ai={ai}
          bestScore={best}
          leaderboard={leaderboard}
          muted={settings.muted}
          onPlay={play}
          onHowTo={() => setHowTo({ open: true, thenPlay: false })}
          onToggleMute={toggleMute}
        />
      )}
      {state === 'PAUSED' && engine && (
        <PauseMenu
          muted={settings.muted}
          onResume={() => engine.resume()}
          onRestart={() => engine.restart()}
          onMenu={() => engine.toMenu()}
          onToggleMute={toggleMute}
        />
      )}
      {state === 'GAME_OVER' && snap?.summary && engine && (
        <GameOver
          summary={snap.summary}
          leaderboard={leaderboard}
          seed={snap.seed}
          onPlayAgain={() => engine.restart()}
          onMenu={() => engine.toMenu()}
        />
      )}
      {howTo.open && <HowToPlay thenPlay={howTo.thenPlay} onClose={closeHowTo} />}
    </div>
  );
}
