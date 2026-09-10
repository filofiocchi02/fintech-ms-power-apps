'use client';

import { useEffect, useRef } from 'react';


interface InputField {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

interface Props {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  /** Disables confirm until a non-empty reason is supplied. */
  reasonInput?: InputField;
  /** Disables confirm until the typed value exactly matches expectedValue. */
  confirmationInput?: InputField & { expectedValue: string };
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmationDialog({
  open,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive = false,
  reasonInput,
  confirmationInput,
  onConfirm,
  onCancel,
}: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const confirmedRef = useRef(false);

  const reasonOk = !reasonInput || reasonInput.value.trim().length > 0;
  const confirmationOk =
    !confirmationInput || confirmationInput.value === confirmationInput.expectedValue;
  const canConfirm = reasonOk && confirmationOk;

  useEffect(() => {
    if (open && ref.current && !ref.current.open) {
      ref.current.showModal();
    } else if (!open && ref.current?.open) {
      ref.current.close();
    }
  }, [open]);

  // The native `close` event fires for Escape, external controlled closure, and the
  // programmatic close that follows a confirm. We only want real cancellations to call
  // `onCancel`; a successful confirm must be treated as a completed action.
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return undefined;

    function handleClose() {
      if (confirmedRef.current) {
        confirmedRef.current = false;
        return;
      }
      onCancel();
    }

    dialog.addEventListener('close', handleClose);
    return () => dialog.removeEventListener('close', handleClose);
  }, [onCancel]);

  return (
    <dialog
      ref={ref}
      className="rounded-lg border border-border-subtle bg-surface p-0 shadow-lg backdrop:bg-slate-900/40"
    >
      <form
        method="dialog"
        className="w-full max-w-md p-6"
        onSubmit={(e) => {
          e.preventDefault();
          if (!canConfirm) return;
          confirmedRef.current = true;
          onConfirm();
        }}
      >
        <h2 className="text-lg font-semibold text-foreground" id="confirm-title">
          {title}
        </h2>
        <p className="mt-2 text-sm text-muted" id="confirm-desc">
          {description}
        </p>

        {reasonInput && (
          <div className="mt-4">
            <label htmlFor="confirm-reason" className="block text-sm font-medium">
              {reasonInput.label}
            </label>
            <textarea
              id="confirm-reason"
              value={reasonInput.value}
              onChange={(e) => reasonInput.onChange(e.target.value)}
              placeholder={reasonInput.placeholder}
              className="mt-1 w-full rounded border border-border-subtle px-3 py-2 text-sm"
              rows={3}
            />
          </div>
        )}

        {confirmationInput && (
          <div className="mt-4">
            <label htmlFor="confirm-typed" className="block text-sm font-medium">
              {confirmationInput.label}
            </label>
            <input
              id="confirm-typed"
              type="text"
              value={confirmationInput.value}
              onChange={(e) => confirmationInput.onChange(e.target.value)}
              placeholder={confirmationInput.placeholder}
              className="mt-1 w-full rounded border border-border-subtle px-3 py-1.5 text-sm"
            />
            <p className="mt-1 text-xs text-muted">
              Type <code>{confirmationInput.expectedValue}</code> to confirm.
            </p>
          </div>
        )}

        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={() => ref.current?.close()}
            className="rounded border border-border-subtle bg-surface px-3 py-1.5 text-sm font-medium text-foreground hover:bg-slate-50"
          >
            {cancelLabel}
          </button>
          <button
            type="submit"
            disabled={!canConfirm}
            className={`rounded px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50 ${
              destructive
                ? 'bg-red-700 hover:bg-red-800'
                : 'bg-blue-700 hover:bg-blue-800'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </form>
    </dialog>
  );
}
