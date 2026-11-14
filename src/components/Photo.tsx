import { useRef, useState, type ReactNode } from 'react';
import { isPdf, useFileUrl } from '../lib/files';
import Icon from './Icon';

/** A stored photo (or PDF) as a tappable thumbnail that opens full screen. */
export function PhotoThumb({ path, label, onDelete, contentType }: { path: string; label?: string; onDelete?: () => void; contentType?: string | null }) {
  const url = useFileUrl(path);
  const [open, setOpen] = useState(false);
  const pdf = isPdf(contentType ?? path);
  return (
    <figure className="thumb">
      <button type="button" className="thumb-btn" onClick={() => (pdf ? url && window.open(url, '_blank', 'noopener') : setOpen(true))} aria-label={label ? `Open ${label}` : 'Open photo'}>
        {pdf ? (
          <span className="thumb-pdf"><Icon name="file" size={28} />PDF</span>
        ) : url ? (
          <img src={url} alt={label ?? ''} loading="lazy" />
        ) : (
          <span className="thumb-loading" />
        )}
      </button>
      {label && <figcaption>{label}</figcaption>}
      {onDelete && (
        <button type="button" className="thumb-delete" onClick={onDelete} aria-label="Remove photo">
          <Icon name="x" size={14} />
        </button>
      )}
      {open && url && <Lightbox url={url} label={label} onClose={() => setOpen(false)} />}
    </figure>
  );
}

export function Lightbox({ url, label, onClose }: { url: string; label?: string; onClose: () => void }) {
  return (
    <div className="lightbox" onClick={onClose} role="dialog" aria-modal="true" aria-label={label ?? 'Photo'}>
      <img src={url} alt={label ?? ''} />
      <button className="lightbox-close" onClick={onClose} aria-label="Close"><Icon name="x" size={22} /></button>
      {label && <div className="lightbox-label">{label}</div>}
    </div>
  );
}

/** "Take or choose photos" button. Opens the camera on phones and tablets. */
export function PhotoPicker({
  onFiles,
  busy,
  children,
  accept = 'image/*',
  multiple = true,
  className = 'btn btn-ghost',
}: {
  onFiles: (files: File[]) => void;
  busy?: boolean;
  children?: ReactNode;
  accept?: string;
  multiple?: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <>
      <button type="button" className={className} onClick={() => ref.current?.click()} disabled={busy}>
        {busy ? <span className="mini-spinner" /> : <Icon name="camera" size={18} />}
        {busy ? 'Uploading…' : children ?? 'Add photos'}
      </button>
      <input
        ref={ref}
        type="file"
        accept={accept}
        multiple={multiple}
        hidden
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = '';
          if (files.length) onFiles(files);
        }}
      />
    </>
  );
}
