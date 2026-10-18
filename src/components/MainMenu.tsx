import { useState } from 'react';
import type { LeaderboardEntry } from '../game/storage';
import type { AiStatus } from '../services/chaosService';
import { AiStatusBadge } from './AiStatusBadge';
import { SoundIcon } from './Icons';
import { Leaderboard } from './Leaderboard';

const FORECASTS = [
  "Today's forecast: questionable physics.",
  'Gravity is on a coffee break. Proceed accordingly.',
  'The floor has been reviewing its options.',
  'Warning: rules may change without notice. Or reason.',
  'Local arena declares itself a sovereign nation of nonsense.',
  'Chance of chaos: yes.',
  'Scientists confirm the arena is "mostly vibes".',
];

interface Props {
  ai: AiStatus;
  bestScore: number;
  leaderboard: LeaderboardEntry[];
  muted: boolean;
  onPlay: () => void;
  onHowTo: () => void;
  onToggleMute: () => void;
}

export function MainMenu({ ai, bestScore, leaderboard, muted, onPlay, onHowTo, onToggleMute }: Props) {
  const [forecast] = useState(() => FORECASTS[Math.floor(Math.random() * FORECASTS.length)]);
  const [touchOnly] = useState(() => window.matchMedia('(pointer: coarse)').matches && !window.matchMedia('(pointer: fine)').matches);

  return (
    <div className="overlay overlay--menu">
      <button className="icon-btn corner-btn" onClick={onToggleMute} aria-label={muted ? 'Unmute sound' : 'Mute sound'}>
        <SoundIcon muted={muted} />
        <span>{muted ? 'SOUND OFF' : 'SOUND ON'}</span>
      </button>

      <div className="menu">
        <section className="menu__hero">
          <p className="menu__kicker">AN AI-DIRECTED SURVIVAL ARENA</p>
          <h1 className="title" data-text="CHAOS THEORY">
            CHAOS<br />THEORY
          </h1>
          <p className="tagline">THE RULES ARE MADE UP. YOUR SURVIVAL ISN&apos;T.</p>
          <p className="forecast">
            <span className="forecast__tag">LIVE</span> {forecast}
          </p>
          <div className="menu__actions">
            <button className="btn btn--primary btn--xl" onClick={onPlay} autoFocus>
              PLAY CHAOS
            </button>
            <button className="btn btn--ghost" onClick={onHowTo}>
              HOW TO PLAY
            </button>
          </div>
          {touchOnly && <p className="menu__warning">Keyboard required — touch controls are not supported yet.</p>}
          <div className="menu__keys">
            <span><kbd>WASD</kbd>/<kbd>←↑↓→</kbd> move</span>
            <span><kbd>SPACE</kbd> dash</span>
            <span><kbd>ESC</kbd> pause</span>
          </div>
        </section>

        <aside className="menu__side">
          <div className="card best-card">
            <span className="card__title">BEST SCORE</span>
            <strong className="best-card__value">{bestScore.toLocaleString()}</strong>
          </div>
          <div className="card">
            <span className="card__title">CHAOS DIRECTOR</span>
            <AiStatusBadge ai={ai} />
          </div>
          <Leaderboard entries={leaderboard} />
        </aside>
      </div>
    </div>
  );
}
