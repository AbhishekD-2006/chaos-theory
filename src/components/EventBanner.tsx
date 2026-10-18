import { MECHANIC_INFO } from '../game/mechanics';
import type { ActiveEventView } from '../game/types';

export function EventBanner({ view }: { view: ActiveEventView }) {
  const { event } = view;
  const info = MECHANIC_INFO[event.mechanic];
  return (
    <div className="event-banner" style={{ ['--accent' as string]: info.color }} role="alert">
      <div className="event-banner__strip">
        <span className="event-banner__kicker">
          INCOMING CHAOS · {event.durationSeconds.toFixed(0)}s
          <span className="event-banner__pips" aria-label={`Difficulty ${event.difficulty} of 5`}>
            {[1, 2, 3, 4, 5].map((d) => (
              <i key={d} className={d <= event.difficulty ? 'on' : undefined} />
            ))}
          </span>
        </span>
        <h2 className="event-banner__name">
          <span className="event-banner__glyph">{info.glyph}</span> {event.name}
        </h2>
        {event.description && <p className="event-banner__desc">{event.description}</p>}
        <p className="event-banner__hint">{info.hint}</p>
        <span className={`event-banner__source src-tag src-tag--${event.source}`}>
          {event.source === 'ai' ? `AI DIRECTOR · ${event.model ?? 'model'}` : 'OFFLINE LIBRARY'}
        </span>
      </div>
    </div>
  );
}
