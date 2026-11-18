import { Link } from 'react-router-dom';
import { useApp } from '../lib/app';
import Modal from './Modal';

export default function LeadPicker({ onClose }: { onClose: () => void }) {
  const { leads, leadId, setLeadId, shift, isAdmin } = useApp();

  return (
    <Modal title={`Shift Lead: ${shift} shift`} onClose={onClose}>
      <p className="muted">Everything logged on this device will show this lead's name until the shift changes.</p>
      {leads.length === 0 ? (
        <div className="empty">
          No HOH Leads have been added yet.
          {isAdmin ? (
            <> <Link to="/setup" onClick={onClose}>Add them in Setup.</Link></>
          ) : (
            ' Ask an admin to add them in Setup.'
          )}
        </div>
      ) : (
        <div className="lead-grid">
          {leads.map((l) => (
            <button
              key={l.id}
              className={`lead-option ${l.id === leadId ? 'selected' : ''}`}
              onClick={() => {
                setLeadId(l.id);
                onClose();
              }}
            >
              {l.name}
            </button>
          ))}
        </div>
      )}
      <div className="modal-foot">
        <Link to="/account" onClick={onClose}>Account &amp; sign out</Link>
      </div>
    </Modal>
  );
}
