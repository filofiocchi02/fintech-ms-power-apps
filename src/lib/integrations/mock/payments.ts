import 'server-only';

import type { PaymentTransaction, PaymentsConnector, RefundResult } from '../types';

const EPOCH = Date.parse('2026-01-05T09:00:00.000Z');

function initialTransactions(): PaymentTransaction[] {
  return [
    {
      paymentRef: 'pay_9001',
      customerRef: 'cus_1001',
      amountMinor: 5000,
      currency: 'GBP',
      capturedAt: new Date(EPOCH - 2 * 24 * 60 * 60 * 1000),
      refundableMinor: 5000,
      status: 'captured',
    },
    {
      paymentRef: 'pay_9002',
      customerRef: 'cus_1002',
      amountMinor: 125000,
      currency: 'GBP',
      capturedAt: new Date(EPOCH - 5 * 24 * 60 * 60 * 1000),
      refundableMinor: 125000,
      status: 'captured',
    },
    {
      paymentRef: 'pay_9003',
      customerRef: 'cus_1003',
      amountMinor: 2999,
      currency: 'EUR',
      capturedAt: new Date(EPOCH - 1 * 24 * 60 * 60 * 1000),
      refundableMinor: 2999,
      status: 'captured',
    },
    {
      paymentRef: 'pay_9004',
      customerRef: 'cus_1004',
      amountMinor: 75000,
      currency: 'USD',
      capturedAt: new Date(EPOCH - 10 * 24 * 60 * 60 * 1000),
      refundableMinor: 50000,
      status: 'captured',
    },
    {
      paymentRef: 'pay_9005',
      customerRef: 'cus_1005',
      amountMinor: 180000,
      currency: 'GBP',
      capturedAt: new Date(EPOCH - 3 * 24 * 60 * 60 * 1000),
      refundableMinor: 180000,
      status: 'captured',
    },
    {
      paymentRef: 'pay_9006',
      customerRef: 'cus_1006',
      amountMinor: 4200,
      currency: 'EUR',
      capturedAt: new Date(EPOCH - 8 * 24 * 60 * 60 * 1000),
      refundableMinor: 0,
      status: 'refunded',
    },
  ];
}

// Mutable in-memory ledger for this prototype. Production replaces this with a real PSP connector.
let transactions: PaymentTransaction[] = initialTransactions();
const executedRefunds = new Map<string, RefundResult>();

function getTransaction(paymentRef: string): PaymentTransaction | null {
  return transactions.find((t) => t.paymentRef === paymentRef) ?? null;
}

export const paymentsConnector: PaymentsConnector = {
  getTransaction,
  listRefundableTransactions(): PaymentTransaction[] {
    return transactions.filter((t) => t.refundableMinor > 0);
  },
  executeRefund(paymentRef: string, amountMinor: number, idempotencyKey: string): RefundResult | { error: string } {
    const existing = executedRefunds.get(idempotencyKey);
    if (existing) {
      return existing;
    }

    if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) {
      return { error: 'Refund amount must be a positive integer' };
    }

    const tx = getTransaction(paymentRef);
    if (!tx) return { error: 'Transaction not found' };
    if (tx.status !== 'captured') return { error: 'Transaction is not refundable' };
    if (amountMinor > tx.refundableMinor) return { error: 'Refund exceeds refundable balance' };

    tx.refundableMinor -= amountMinor;
    if (tx.refundableMinor === 0) {
      tx.status = 'refunded';
    }

    const result: RefundResult = {
      executionRef: `rfexec_${idempotencyKey}`,
      refundedMinor: amountMinor,
      currency: tx.currency,
    };
    executedRefunds.set(idempotencyKey, result);
    return result;
  },
};

/** Resets mutable mock state between tests. Not part of the public connector contract. */
export function resetMockPayments(): void {
  transactions = initialTransactions();
  executedRefunds.clear();
}
