import { MECHANIC_INFO } from '../game/mechanics';
import type { HudSnapshot } from '../game/types';
import type { AiStatus } from '../services/chaosService';
import { AiStatusBadge } from './AiStatusBadge';
import { HeartIcon } from './Icons';

export function GameHUD({ snap, ai }: { snap: HudSnapshot; ai: AiStatus }) {
  const ev = snap.activeEvent;
  const info = ev ? MECHANIC_INFO[ev.event.mechanic] : null;
  const low = snap.timeLeft <= 10;

  return (
    <div className="hud">
      <div className="hud__top">
        <div className="hud__score">
          <span className="hud__label">SCORE</span>
          <strong>{snap.score.toLocaleString()}</strong>
          {snap.scoreMultiplier > 1 && <span className="hud__mult">x{snap.scoreMultiplier}</span>}
        </div>

        <div className={`hud__timer ${low ? 'is-low' : ''}`}>
          <span className="hud__label">TIME</span>
          <strong>{Math.ceil(snap.timeLeft)}</strong>
        </div>

        <div className="hud__lives" aria-label={`${snap.lives} lives left`}>
          <span className="hud__label">LIVES</span>
          <div>
            {[0, 1, 2].map((i) => (
              <HeartIcon key={i} filled={i < snap.lives} />
            ))}
          </div>
        </div>
      </div>

      {ev && info && ev.phase === 'active' && (
        <div className="hud__event" style={{ ['--accent' as string]: info.color }}>
          <span className="hud__event-glyph">{info.glyph}</span>
          <div className="hud__event-body">
            <div className="hud__event-name">
              {ev.event.name}
              <span className={`src-tag src-tag--${ev.event.source}`}>{ev.event.source === 'ai' ? 'AI' : 'OFFLINE'}</span>
            </div>
            <div className="hud__event-hint">{info.hint}</div>
            <div className="hud__event-bar">
              <span style={{ width: `${(ev.remaining / Math.max(0.1, ev.total)) * 100}%` }} />
            </div>
          </div>
          <span className="hud__event-time">{ev.remaining.toFixed(1)}s</span>
        </div>
      )}

      <div className="hud__bottom">
        <div className="hud__dash">
          <span className="hud__label">DASH</span>
          <div className={`hud__dash-bar ${snap.dashCharge >= 1 ? 'is-ready' : ''}`}>
            <span style={{ width: `${Math.min(1, snap.dashCharge) * 100}%` }} />
          </div>
          <kbd>SPACE</kbd>
        </div>

        <div className="hud__history">
          <AiStatusBadge ai={ai} compact />
          {snap.history.length > 0 && <span className="hud__label">CHAOS LOG</span>}
          <ul>
            {snap.history.map((e) => (
              <li key={e.id} style={{ ['--accent' as string]: MECHANIC_INFO[e.mechanic].color }}>
                <span>{MECHANIC_INFO[e.mechanic].glyph}</span> {e.name}
                <span className={`src-tag src-tag--${e.source}`}>{e.source === 'ai' ? 'AI' : 'OFF'}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {snap.state === 'COUNTDOWN' && (
        <div className="countdown" key={snap.countdown}>
          {snap.countdown > 0 ? snap.countdown : 'GO'}
        </div>
      )}
    </div>
  );
}
