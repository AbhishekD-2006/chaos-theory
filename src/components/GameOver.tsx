import { useEffect, useRef, useState } from 'react';
import type { LeaderboardEntry } from '../game/storage';
import type { GameSummary } from '../game/types';
import { Leaderboard } from './Leaderboard';

interface Props {
  summary: GameSummary;
  leaderboard: LeaderboardEntry[];
  seed: number;
  onPlayAgain: () => void;
  onMenu: () => void;
}

export function GameOver({ summary, leaderboard, seed, onPlayAgain, onMenu }: Props) {
  const { stats, title, subtitle } = summary;
  const [shareMsg, setShareMsg] = useState<string | null>(null);
  const timer = useRef<number>();
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const share = async () => {
    const text = `I scored ${stats.score.toLocaleString()} in CHAOS THEORY and was crowned "${title}". Survived ${stats.survivalTime.toFixed(1)}s and ${stats.eventsSurvived} chaos events. The rules are made up. My survival wasn't.`;
    let msg = 'Copied to clipboard!';
    try {
      if (navigator.share) {
        await navigator.share({ title: 'CHAOS THEORY', text });
        msg = 'Shared!';
      } else {
        await navigator.clipboard.writeText(text);
      }
    } catch (err) {
      if ((err as DOMException)?.name === 'AbortError') return;
      msg = 'Could not share — copy blocked by the browser.';
    }
    setShareMsg(msg);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setShareMsg(null), 2500);
  };

  return (
    <div className="overlay overlay--modal" role="dialog" aria-modal="true" aria-labelledby="go-title">
      <div className="modal gameover">
        <div className="gameover__main">
          <p className={`gameover__kicker ${stats.won ? 'is-win' : ''}`}>{stats.won ? 'TIME! YOU SURVIVED' : 'GAME OVER'}</p>
          <h2 id="go-title" className="gameover__score">
            {stats.score.toLocaleString()}
            {summary.isNewBest && <span className="badge-new">NEW BEST</span>}
          </h2>
          <div className="gameover__title">
            <span className="hud__label">THE CHAOS DIRECTOR HAS RATED YOU</span>
            <strong>&ldquo;{title}&rdquo;</strong>
            <small>{subtitle}</small>
          </div>
          <dl className="stats">
            <div><dt>SURVIVED</dt><dd>{stats.survivalTime.toFixed(1)}s</dd></div>
            <div><dt>ORBS</dt><dd>{stats.orbsCollected}</dd></div>
            <div><dt>EVENTS SURVIVED</dt><dd>{stats.eventsSurvived}</dd></div>
            <div><dt>CLOSE CALLS</dt><dd>{stats.nearMisses}</dd></div>
            <div><dt>LIVES LOST</dt><dd>{stats.livesLost}</dd></div>
            <div><dt>BEST</dt><dd>{summary.bestScore.toLocaleString()}</dd></div>
          </dl>
          <div className="gameover__actions">
            <button className="btn btn--primary" onClick={onPlayAgain} autoFocus>PLAY AGAIN <kbd>R</kbd></button>
            <button className="btn btn--ghost" onClick={onMenu}>MAIN MENU</button>
            <button className="btn btn--ghost" onClick={share}>SHARE SCORE</button>
          </div>
          <p className="gameover__toast" aria-live="polite">{shareMsg ?? '\u00a0'}</p>
          <p className="gameover__seed">seed {seed} — replay with <code>?seed={seed}</code></p>
        </div>
        <Leaderboard entries={leaderboard} highlightRank={summary.rank} />
      </div>
    </div>
  );
}
