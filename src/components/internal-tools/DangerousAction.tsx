'use client';

import { cloneElement, isValidElement, useState } from 'react';

import { ConfirmationDialog } from './ConfirmationDialog';

interface Props {
  trigger: React.ReactNode;
  title: string;
  description: string;
  /** The exact value the operator must type to enable the action. */
  confirmationValue: string;
  confirmLabel?: string;
  onConfirm: () => void;
}

/**
 * A destructive or high-consequence action that requires the operator to type a specific
 * value before confirming. Used for production flag writes and irreversible decisions.
 */
export function DangerousAction({
  trigger,
  title,
  description,
  confirmationValue,
  confirmLabel = 'Confirm',
  onConfirm,
}: Props) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');

  const triggerWithHandler = isValidElement(trigger)
    ? cloneElement(trigger as React.ReactElement<{ onClick?: () => void }>, {
        onClick: () => setOpen(true),
      })
    : trigger;

  return (
    <>
      {triggerWithHandler}
      <ConfirmationDialog
        open={open}
        destructive
        title={title}
        description={description}
        confirmLabel={confirmLabel}
        confirmationInput={{
          label: `Confirm by typing ${confirmationValue}`,
          value: typed,
          onChange: setTyped,
          expectedValue: confirmationValue,
        }}
        onCancel={() => {
          setOpen(false);
          setTyped('');
        }}
        onConfirm={() => {
          onConfirm();
          setOpen(false);
          setTyped('');
        }}
      />
    </>
  );
}
