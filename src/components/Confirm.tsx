import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import Modal from './Modal';

interface ConfirmOptions {
  title: string;
  body?: string;
  confirmLabel?: string;
  danger?: boolean;
}

const ConfirmContext = createContext<(o: ConfirmOptions) => Promise<boolean>>(async () => false);

/** In-app "Are you sure?" dialog: `if (!(await confirm({ title: 'Delete?' }))) return;` */
export function useConfirm() {
  return useContext(ConfirmContext);
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [opts, setOpts] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<(v: boolean) => void>();

  const ask = useCallback((o: ConfirmOptions) => {
    setOpts(o);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const close = (v: boolean) => {
    resolver.current?.(v);
    resolver.current = undefined;
    setOpts(null);
  };

  return (
    <ConfirmContext.Provider value={ask}>
      {children}
      {opts && (
        <Modal title={opts.title} onClose={() => close(false)}>
          {opts.body && <p className="confirm-body">{opts.body}</p>}
          <div className="confirm-actions">
            <button className="btn btn-ghost" onClick={() => close(false)}>Cancel</button>
            <button className={`btn ${opts.danger ? 'btn-danger btn-solid' : 'btn-primary'}`} onClick={() => close(true)} autoFocus>
              {opts.confirmLabel ?? 'OK'}
            </button>
          </div>
        </Modal>
      )}
    </ConfirmContext.Provider>
  );
}
