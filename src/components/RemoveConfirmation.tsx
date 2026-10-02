'use client';
import { useEffect, useRef } from 'react';
import type { TrackedCard } from '@/lib/tracking';

export default function RemoveConfirmation({ pr, busy, onCancel, onConfirm }: {
  pr: TrackedCard; busy: boolean; onCancel: () => void; onConfirm: () => Promise<void>;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  return <dialog ref={dialog} className="remove-dialog" aria-labelledby="remove-heading" onCancel={(event) => {
    if (busy) event.preventDefault(); else onCancel();
  }}>
    <h2 id="remove-heading">Remove this PR?</h2><p>{pr.title}</p>
    <p className="muted">It will leave My View. You can add it again later.</p>
    <div className="pr-actions"><button className="button button-secondary" autoFocus disabled={busy} onClick={onCancel}>Cancel</button>
      <button className="button button-primary" disabled={busy} onClick={() => void onConfirm()}>Remove PR</button></div>
  </dialog>;
}
