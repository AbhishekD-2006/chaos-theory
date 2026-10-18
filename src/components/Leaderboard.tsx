import type { LeaderboardEntry } from '../game/storage';

export function Leaderboard({ entries, highlightRank }: { entries: LeaderboardEntry[]; highlightRank?: number | null }) {
  return (
    <div className="card leaderboard">
      <h3 className="card__title">HALL OF CHAOS</h3>
      {entries.length === 0 ? (
        <p className="leaderboard__empty">No scores yet. The arena awaits its first victim.</p>
      ) : (
        <ol className="leaderboard__list">
          {entries.map((e, i) => (
            <li key={`${e.date}-${i}`} className={highlightRank === i + 1 ? 'is-new' : undefined}>
              <span className="leaderboard__rank">{i + 1}</span>
              <span className="leaderboard__main">
                <strong>{e.score.toLocaleString()}</strong>
                <small>{e.title}</small>
              </span>
              <span className="leaderboard__meta">
                {e.survivalTime.toFixed(0)}s
                <small>{new Date(e.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</small>
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
