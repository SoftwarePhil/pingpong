'use client';

import { createContext, ReactNode, useCallback, useContext, useEffect, useRef, useState } from 'react';

export interface ConfirmOptions {
  title: string;
  message: ReactNode;
  confirmLabel: string;
  /** Danger actions use the loss color and start with focus on Cancel. */
  tone?: 'default' | 'danger';
}

type Confirm = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<Confirm | null>(null);

/** Asks the viewer to confirm an action in an in-page dialog; resolves to their answer. */
export function useConfirm(): Confirm {
  const confirm = useContext(ConfirmContext);
  if (!confirm) throw new Error('useConfirm must be used inside ConfirmProvider');
  return confirm;
}

type Pending = ConfirmOptions & { resolve: (answer: boolean) => void };

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<Pending | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);

  const confirm = useCallback<Confirm>(
    options => new Promise(resolve => setPending({ ...options, resolve })),
    [],
  );

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!pending || !dialog) return;
    if (!dialog.open) dialog.showModal();
    (pending.tone === 'danger' ? cancelRef : confirmRef).current?.focus();
  }, [pending]);

  const answer = (value: boolean) => {
    pending?.resolve(value);
    setPending(null);
    if (dialogRef.current?.open) dialogRef.current.close();
  };

  const danger = pending?.tone === 'danger';

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <dialog
        ref={dialogRef}
        aria-labelledby="confirm-dialog-title"
        // Escape closes the dialog natively; treat that as Cancel.
        onCancel={event => { event.preventDefault(); answer(false); }}
        onClick={event => { if (event.target === dialogRef.current) answer(false); }}
        className="m-auto w-[min(28rem,calc(100vw-2rem))] rounded-xl border border-line bg-surface p-0 text-ink shadow-2xl backdrop:bg-board/60 backdrop:backdrop-blur-sm"
      >
        {pending && (
          <div className="p-6">
            <h2 id="confirm-dialog-title" className="text-lg font-bold text-ink">{pending.title}</h2>
            <div className="mt-2 text-sm leading-relaxed text-ink-soft">{pending.message}</div>
            <div className="mt-6 flex justify-end gap-3">
              <button ref={cancelRef} type="button" onClick={() => answer(false)} className="button button-secondary">
                Cancel
              </button>
              <button
                ref={confirmRef}
                type="button"
                onClick={() => answer(true)}
                className={danger ? 'button bg-loss border-loss text-surface hover:brightness-95' : 'button button-primary'}
              >
                {pending.confirmLabel}
              </button>
            </div>
          </div>
        )}
      </dialog>
    </ConfirmContext.Provider>
  );
}
