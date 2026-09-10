'use client';

import { ConfirmationDialog } from '@/components/internal-tools/ConfirmationDialog';
import type { FlagEnvironment } from '@/lib/integrations/types';

import type { useFlagChange } from './useFlagChange';

interface Props {
  flagKey: string;
  environment: FlagEnvironment;
  description: string;
  change: ReturnType<typeof useFlagChange>;
}

/**
 * The confirmation step every flag change goes through. Production asks for the flag key
 * typed back and a reason — as a prompt to think, not as the check: the server requires both.
 */
export function FlagChangeDialog({ flagKey, environment, description, change }: Props) {
  const isProduction = environment === 'production';

  // Mounting only while open clears the native dialog's confirm latch between changes, and
  // keeps the form controls of a closed dialog out of the page entirely.
  if (change.pending === null) return null;

  return (
    <ConfirmationDialog
      open
      title={isProduction ? `Change ${flagKey} in production` : `Change ${flagKey} in ${environment}`}
      description={description}
      confirmLabel={change.submitting ? 'Applying…' : 'Apply change'}
      destructive={isProduction}
      reasonInput={{
        label: 'Reason',
        value: change.reason,
        onChange: change.setReason,
        placeholder: 'Why is this change being made?',
      }}
      confirmationInput={
        isProduction
          ? {
              label: 'Type the flag key to confirm',
              value: change.confirmation,
              onChange: change.setConfirmation,
              placeholder: flagKey,
              expectedValue: flagKey,
            }
          : undefined
      }
      onConfirm={change.submit}
      onCancel={change.close}
    />
  );
}
