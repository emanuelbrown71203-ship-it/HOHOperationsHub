import { useEffect, useRef, useState, type ReactNode, type TouchEvent } from 'react';
import Icon from './Icon';

/**
 * A pop-up. On a phone it is a sheet that slides up from the bottom, with a handle you can drag down to
 * close; on a bigger screen it is a centred card. Tapping outside or pressing Escape closes it.
 */
export default function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const [drag, setDrag] = useState(0);
  const startY = useRef<number | null>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  // Drag the handle (or the title bar) down to close.
  const begin = (e: TouchEvent) => {
    startY.current = e.touches[0].clientY;
  };
  const move = (e: TouchEvent) => {
    if (startY.current === null) return;
    setDrag(Math.max(0, e.touches[0].clientY - startY.current));
  };
  const end = () => {
    if (startY.current === null) return;
    startY.current = null;
    if (drag > 110) onClose();
    else setDrag(0);
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className={`modal ${drag ? 'dragging' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        style={drag ? { transform: `translateY(${drag}px)` } : undefined}
      >
        <div className="modal-grab" onTouchStart={begin} onTouchMove={move} onTouchEnd={end} onTouchCancel={end}>
          <span className="modal-handle" aria-hidden="true" />
          <div className="modal-head">
            <h2>{title}</h2>
            <button className="icon-btn" onClick={onClose} aria-label="Close">
              <Icon name="x" />
            </button>
          </div>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}
