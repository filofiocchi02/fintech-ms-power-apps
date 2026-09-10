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

  it('returns defensive copies that cannot corrupt authoritative state', () => {
    const customer = customerConnector.getCustomer('cus_1001');
    expect(customer).not.toBeNull();
    if (!customer) throw new Error('unexpected');
    customer.accountStatus = 'closed';
    expect(customerConnector.getCustomer('cus_1001')?.accountStatus).toBe('active');

    const customers = customerConnector.listCustomers();
    customers[0].accountStatus = 'closed';
    expect(customerConnector.listCustomers()[0].accountStatus).toBe('active');
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

  it('returns defensive copies so callers cannot mutate connector state', () => {
    const open = kycProviderConnector.listOpenCases();
    expect(open.length).toBeGreaterThan(0);
    open[0].status = 'verified';

    expect(kycProviderConnector.listOpenCases().every((c) => c.status === 'pending')).toBe(true);

    const caseCopy = kycProviderConnector.getCase('kyc_case_5002');
    expect(caseCopy).not.toBeNull();
    if (!caseCopy) throw new Error('unexpected');
    caseCopy.riskLevel = 'high';
    expect(kycProviderConnector.getCase('kyc_case_5002')?.riskLevel).toBe('low');
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

  it('rejects non-positive refund amounts before touching the ledger', () => {
    const before = paymentsConnector.getTransaction('pay_9001')?.refundableMinor;

    expect(paymentsConnector.executeRefund('pay_9001', 0, 'idem_zero')).toEqual({
      error: 'Refund amount must be a positive integer',
    });
    expect(paymentsConnector.executeRefund('pay_9001', -1000, 'idem_negative')).toEqual({
      error: 'Refund amount must be a positive integer',
    });

    expect(paymentsConnector.getTransaction('pay_9001')?.refundableMinor).toBe(before);
  });

  it('executes idempotently', () => {
    const first = paymentsConnector.executeRefund('pay_9001', 1000, 'idem_repeat');
    const second = paymentsConnector.executeRefund('pay_9001', 1000, 'idem_repeat');
    expect(first).toEqual(second);

    const tx = paymentsConnector.getTransaction('pay_9001');
    expect(tx?.refundableMinor).toBe(4000);
  });

  it('detects an idempotency key reused for a different refund without mutation', () => {
    const first = paymentsConnector.executeRefund('pay_9001', 1000, 'idem_mismatch');
    expect('error' in first).toBe(false);

    const second = paymentsConnector.executeRefund('pay_9002', 5000, 'idem_mismatch');
    expect(second).toEqual({ error: 'Idempotency key conflict' });

    // pay_9002 must not have been touched.
    expect(paymentsConnector.getTransaction('pay_9002')?.refundableMinor).toBe(125000);
  });

  it('returns defensive copies that cannot mutate the ledger', () => {
    const tx = paymentsConnector.getTransaction('pay_9001');
    expect(tx).not.toBeNull();
    if (!tx) throw new Error('unexpected');
    tx.refundableMinor = 0;

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
