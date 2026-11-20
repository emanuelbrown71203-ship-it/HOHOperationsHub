import { useId, useState, type ReactNode } from 'react';
import Icon from './Icon';

/** Detail one tap away: a closed heading with a one-line summary, the same as in the owner's other apps. */
export default function Fold({ title, summary, children, defaultOpen = false, className = '' }: { title: ReactNode; summary?: ReactNode; children: ReactNode; defaultOpen?: boolean; className?: string }) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();
  return (
    <div className={`fold ${open ? 'open' : ''} ${className}`}>
      <button type="button" className="fold-head" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}>
        <span className="fold-title">{title}</span>
        <span className="fold-summary">
          {!open && summary && <span>{summary}</span>}
          <Icon name="down" size={18} />
        </span>
      </button>
      {open && <div id={id} className="fold-body">{children}</div>}
    </div>
  );
}
