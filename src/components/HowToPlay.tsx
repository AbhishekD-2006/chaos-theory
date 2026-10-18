import { useEffect } from 'react';
import { MECHANICS, MECHANIC_IDS } from '../../shared/chaosSchema';
import { MECHANIC_INFO } from '../game/mechanics';

interface Props {
  thenPlay: boolean;
  onClose: (start: boolean) => void;
}

export function HowToPlay({ thenPlay, onClose }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Escape') onClose(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="overlay overlay--modal" role="dialog" aria-modal="true" aria-labelledby="howto-title">
      <div className="modal howto">
        <h2 id="howto-title" className="modal__title">HOW TO SURVIVE</h2>
        <div className="howto__grid">
          <section>
            <h3>CONTROLS</h3>
            <ul className="howto__controls">
              <li><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> or <kbd>←</kbd><kbd>↑</kbd><kbd>↓</kbd><kbd>→</kbd> Move</li>
              <li><kbd>SPACE</kbd> Dash — brief invincibility, 1.4s cooldown (ring around you)</li>
              <li><kbd>ESC</kbd> Pause &nbsp; <kbd>R</kbd> Restart (paused / game over)</li>
            </ul>
            <h3>RULES</h3>
            <ul className="howto__rules">
              <li><span className="swatch swatch--lime" /> Green orbs: <b>+10</b>. Gold orbs: <b>+30</b> or more.</li>
              <li><span className="swatch swatch--pink" /> Pink spiky hazards cost a life. Dashed rings warn where they spawn.</li>
              <li><span className="swatch swatch--cyan" /> Dodging close to a hazard: <b>CLOSE CALL +15</b>.</li>
              <li>3 lives, 60 seconds. Survive each chaos event for <b>+50</b> (<b>+100</b> if flawless).</li>
            </ul>
          </section>
          <section>
            <h3>CHAOS EVENTS</h3>
            <p className="howto__note">
              Every few seconds the chaos director picks a new rule. With an API key it&apos;s written by an AI model;
              otherwise by the offline library. Either way, the game engine enforces it.
            </p>
            <ul className="howto__events">
              {MECHANIC_IDS.map((id) => (
                <li key={id} title={MECHANICS[id].effect}>
                  <span className="howto__glyph" style={{ color: MECHANIC_INFO[id].color }}>{MECHANIC_INFO[id].glyph}</span>
                  <span>
                    <b>{MECHANIC_INFO[id].label}</b>
                    <small>{MECHANIC_INFO[id].hint}</small>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        </div>
        <div className="modal__actions">
          {thenPlay ? (
            <button className="btn btn--primary" onClick={() => onClose(true)} autoFocus>
              GOT IT — PLAY
            </button>
          ) : (
            <button className="btn btn--primary" onClick={() => onClose(false)} autoFocus>
              GOT IT
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
