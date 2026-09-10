import { beforeEach, describe, expect, it } from 'vitest';

import { customerConnector } from './mock/customers';
import { kycProviderConnector } from './mock/kyc-provider';
import { paymentsConnector, resetMockPayments } from './mock/payments';
import { featureFlagConnector, resetMockFeatureFlags } from './mock/feature-flags';

describe('CustomerConnector', () => {
  it('returns a customer by ref', () => {
    const customer = customerConnector.getCustomer('cus_1001');
    expect(customer?.displayName).toBe('Acme Corp');
  });

  it('returns null for unknown refs', () => {
    expect(customerConnector.getCustomer('cus_nope')).toBeNull();
  });
});

describe('KycProviderConnector', () => {
  it('provides open cases for the queue', () => {
    const open = kycProviderConnector.listOpenCases();
    expect(open.length).toBeGreaterThan(0);
    expect(open.every((c) => c.status === 'pending')).toBe(true);
  });

  it('includes a sanctions case and a PEP case', () => {
    const sanctions = kycProviderConnector.getCase('kyc_case_5004');
    expect(sanctions?.hasSanctionsFlag).toBe(true);

    const pep = kycProviderConnector.getCase('kyc_case_5003');
    expect(pep?.hasPepFlag).toBe(true);
  });
});

describe('PaymentsConnector', () => {
  beforeEach(() => {
    resetMockPayments();
  });

  it('lists refundable transactions', () => {
    const refundable = paymentsConnector.listRefundableTransactions();
    expect(refundable.length).toBeGreaterThan(0);
    expect(refundable.every((t) => t.refundableMinor > 0)).toBe(true);
  });

  it('includes a large refund transaction', () => {
    const tx = paymentsConnector.getTransaction('pay_9005');
    expect(tx?.amountMinor).toBe(180000);
    expect(tx?.refundableMinor).toBe(180000);
  });

  it('refuses refunds exceeding the refundable balance', () => {
    const result = paymentsConnector.executeRefund('pay_9001', 999999, 'idem_1');
    expect(result).toEqual({ error: 'Refund exceeds refundable balance' });
  });

  it('executes idempotently', () => {
    const first = paymentsConnector.executeRefund('pay_9001', 1000, 'idem_repeat');
    const second = paymentsConnector.executeRefund('pay_9001', 1000, 'idem_repeat');
    expect(first).toEqual(second);

    const tx = paymentsConnector.getTransaction('pay_9001');
    expect(tx?.refundableMinor).toBe(4000);
  });

  it('keeps financial invariants in the connector, not the route', () => {
    // Only the payments system knows the refundable balance; the internal tool never mirrors it.
    expect(paymentsConnector.getTransaction('pay_9001')?.refundableMinor).toBe(5000);
  });
});

describe('FeatureFlagConnector', () => {
  beforeEach(() => {
    resetMockFeatureFlags();
  });

  it('lists flags per environment', () => {
    const dev = featureFlagConnector.listFlags('dev');
    expect(dev.length).toBeGreaterThan(0);

    const prod = featureFlagConnector.listFlags('production');
    expect(prod.some((f) => f.key === 'kyc-auto-approve')).toBe(true);
  });

  it('records history inside the connector, not SQLite', () => {
    const before = featureFlagConnector.getHistory('new-dashboard', 'dev');
    expect(before).toHaveLength(0);

    featureFlagConnector.setFlag('new-dashboard', 'dev', false, 'demo_release_engineer', 'Test disable');

    const after = featureFlagConnector.getHistory('new-dashboard', 'dev');
    expect(after).toHaveLength(1);
    expect(after[0].enabled).toBe(false);
  });

  it('requires a reason for production flag writes', () => {
    const result = featureFlagConnector.setFlag(
      'kyc-auto-approve',
      'production',
      true,
      'demo_manager_admin',
      '',
    );
    expect(result).toEqual({ error: 'Production flag changes require a reason' });
  });
});
