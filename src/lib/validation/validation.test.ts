import { describe, expect, it } from 'vitest';

import { isAppError } from '@/lib/errors/errors';

import { amountMinor, parseOrAppError, reason } from './zod';

describe('parseOrAppError', () => {
  it('returns parsed data on valid input', () => {
    const result = parseOrAppError(amountMinor, 100, () => 'Invalid amount');
    expect(isAppError(result)).toBe(false);
    if (isAppError(result)) throw new Error('unexpected');
    expect(result).toBe(100);
  });

  it('returns an AppError on invalid input so isAppError narrows it', () => {
    const result = parseOrAppError(amountMinor, 0, (issues) =>
      issues.map((i) => i.message).join(', '),
    );
    expect(isAppError(result)).toBe(true);
    if (!isAppError(result)) throw new Error('unexpected');
    expect(result.code).toBe('VALIDATION');
    expect(result.status).toBe(400);
    expect(result.details).toBeDefined();
  });
});

describe('amountMinor schema', () => {
  it('rejects string input instead of coercing it', () => {
    const result = amountMinor.safeParse('100');
    expect(result.success).toBe(false);
  });

  it('rejects boolean input', () => {
    const result = amountMinor.safeParse(true);
    expect(result.success).toBe(false);
  });
});

describe('reason schema', () => {
  it('rejects whitespace-only input', () => {
    const result = reason.safeParse('   ');
    expect(result.success).toBe(false);
  });

  it('trims accepted input', () => {
    const result = reason.safeParse('  damaged goods  ');
    expect(result.success).toBe(true);
    if (!result.success) throw new Error('unexpected');
    expect(result.data).toBe('damaged goods');
  });
});
