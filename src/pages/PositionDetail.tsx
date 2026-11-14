import { Link, useParams } from 'react-router-dom';
import { useApp } from '../lib/app';
import { usePositions } from '../lib/usePositions';
import { isPdf, useFileUrl } from '../lib/files';
import type { PositionFile } from '../lib/types';
import Icon from '../components/Icon';

export default function PositionDetail() {
  const { id } = useParams();
  const { isManager } = useApp();
  const { positions, filesFor, loading } = usePositions(true);
  const position = positions.find((p) => p.id === id);
  const files = position ? filesFor(position.id) : [];

  return (
    <div className="page narrow sec-positions">
      <Link to="/checklists" className="back-link"><Icon name="back" /> Checklists</Link>
      {loading ? (
        <div className="spinner" />
      ) : !position ? (
        <div className="empty">This position was not found.</div>
      ) : (
        <>
          <div className="page-title">
            <span className="page-icon position-icon">{position.name.slice(0, 1)}</span>
            <div>
              <span className="shift-tag">Position checklist</span>
              <h1>{position.name}</h1>
            </div>
          </div>
          {position.description && <p className="position-desc">{position.description}</p>}
          {files.length === 0 ? (
            <div className="empty">
              No checklist attached yet.
              {isManager ? <> <Link to="/setup?tab=positions">Attach one in Setup → Positions.</Link></> : ' Ask a lead or director to attach it.'}
            </div>
          ) : (
            <div className="doc-list">{files.map((f) => <DocView key={f.id} file={f} />)}</div>
          )}
        </>
      )}
    </div>
  );
}

function DocView({ file }: { file: PositionFile }) {
  const url = useFileUrl(file.path);
  if (isPdf(file.content_type ?? file.path)) {
    return (
      <a className="doc-pdf" href={url ?? undefined} target="_blank" rel="noopener noreferrer">
        <Icon name="file" size={28} />
        <span><strong>{file.file_name}</strong><small>PDF · tap to open</small></span>
        <Icon name="chevron" />
      </a>
    );
  }
  return (
    <figure className="doc-image">
      {url ? (
        <a href={url} target="_blank" rel="noopener noreferrer"><img src={url} alt={file.file_name} /></a>
      ) : (
        <div className="thumb-loading tall" />
      )}
      <figcaption>{file.file_name}</figcaption>
    </figure>
  );
}
