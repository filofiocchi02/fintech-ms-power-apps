import 'server-only';

import type { KycEvidence, KycProviderConnector } from '../types';

const EPOCH = Date.parse('2026-01-05T09:00:00.000Z');

const CASES: KycEvidence[] = [
  {
    providerCaseRef: 'kyc_case_5001',
    customerRef: 'cus_1001',
    status: 'verified',
    riskLevel: 'low',
    hasSanctionsFlag: false,
    hasPepFlag: false,
    submittedAt: new Date(EPOCH - 24 * 60 * 60 * 1000),
    reviewedAt: new Date(EPOCH - 12 * 60 * 60 * 1000),
  },
  {
    providerCaseRef: 'kyc_case_5002',
    customerRef: 'cus_1002',
    status: 'pending',
    riskLevel: 'low',
    hasSanctionsFlag: false,
    hasPepFlag: false,
    submittedAt: new Date(EPOCH - 36 * 60 * 60 * 1000),
    reviewedAt: null,
  },
  {
    providerCaseRef: 'kyc_case_5003',
    customerRef: 'cus_1003',
    status: 'pending',
    riskLevel: 'medium',
    hasSanctionsFlag: false,
    hasPepFlag: true,
    submittedAt: new Date(EPOCH - 48 * 60 * 60 * 1000),
    reviewedAt: null,
  },
  {
    providerCaseRef: 'kyc_case_5004',
    customerRef: 'cus_1004',
    status: 'pending',
    riskLevel: 'high',
    hasSanctionsFlag: true,
    hasPepFlag: false,
    submittedAt: new Date(EPOCH - 72 * 60 * 60 * 1000),
    reviewedAt: null,
  },
  {
    providerCaseRef: 'kyc_case_5005',
    customerRef: 'cus_1005',
    status: 'pending',
    riskLevel: 'medium',
    hasSanctionsFlag: false,
    hasPepFlag: false,
    submittedAt: new Date(EPOCH - 96 * 60 * 60 * 1000),
    reviewedAt: null,
  },
  {
    providerCaseRef: 'kyc_case_5006',
    customerRef: 'cus_1006',
    status: 'rejected',
    riskLevel: 'high',
    hasSanctionsFlag: true,
    hasPepFlag: true,
    submittedAt: new Date(EPOCH - 120 * 60 * 60 * 1000),
    reviewedAt: new Date(EPOCH - 110 * 60 * 60 * 1000),
  },
];

export const kycProviderConnector: KycProviderConnector = {
  getCase(providerCaseRef: string): KycEvidence | null {
    return CASES.find((c) => c.providerCaseRef === providerCaseRef) ?? null;
  },
  listOpenCases(): KycEvidence[] {
    return CASES.filter((c) => c.status === 'pending');
  },
};
