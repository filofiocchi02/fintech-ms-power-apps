import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ConfirmationDialog } from './ConfirmationDialog';

afterEach(cleanup);

function ControlledDialog({
  open,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <ConfirmationDialog
      open={open}
      title="Confirm action"
      description="Are you sure?"
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  );
}

describe('ConfirmationDialog', () => {
  it('calls onConfirm but not onCancel when Confirm is clicked', () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();

    render(<ControlledDialog open onConfirm={onConfirm} onCancel={onCancel} />);

    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('calls onCancel when Cancel is clicked', () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();

    render(<ControlledDialog open onConfirm={onConfirm} onCancel={onCancel} />);

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('requires the exact typed confirmation value', () => {
    render(
      <ConfirmationDialog
        open
        title="Delete flag"
        description="Type the flag key to confirm."
        confirmationInput={{
          label: 'Flag key',
          value: '',
          onChange: () => undefined,
          expectedValue: 'instant-payouts',
        }}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: 'Confirm' })).toBeDisabled();
  });
});
