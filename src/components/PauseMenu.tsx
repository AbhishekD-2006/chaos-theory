import { SoundIcon } from './Icons';

interface Props {
  muted: boolean;
  onResume: () => void;
  onRestart: () => void;
  onMenu: () => void;
  onToggleMute: () => void;
}

export function PauseMenu({ muted, onResume, onRestart, onMenu, onToggleMute }: Props) {
  return (
    <div className="overlay overlay--modal" role="dialog" aria-modal="true" aria-label="Paused">
      <div className="modal modal--narrow">
        <h2 className="modal__title">PAUSED</h2>
        <p className="modal__sub">The chaos politely waits. For now.</p>
        <div className="stack">
          <button className="btn btn--primary" onClick={onResume} autoFocus>RESUME</button>
          <button className="btn btn--ghost" onClick={onRestart}>RESTART <kbd>R</kbd></button>
          <button className="btn btn--ghost" onClick={onMenu}>MAIN MENU</button>
          <button className="btn btn--ghost" onClick={onToggleMute}>
            <SoundIcon muted={muted} /> {muted ? 'SOUND OFF' : 'SOUND ON'}
          </button>
        </div>
        <p className="modal__hint"><kbd>ESC</kbd> to resume</p>
      </div>
    </div>
  );
}
