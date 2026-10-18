import type { AiStatus } from '../services/chaosService';

const LABEL = { online: 'AI ONLINE', offline: 'OFFLINE MODE', checking: 'CONNECTING…' } as const;

export function AiStatusBadge({ ai, compact = false }: { ai: AiStatus; compact?: boolean }) {
  return (
    <div className={`ai-badge ai-badge--${ai.mode} ${compact ? 'ai-badge--compact' : ''}`} title={ai.detail} role="status">
      <span className="ai-badge__dot" />
      <span className="ai-badge__label">{LABEL[ai.mode]}</span>
      {!compact && <span className="ai-badge__detail">{ai.detail}</span>}
    </div>
  );
}
