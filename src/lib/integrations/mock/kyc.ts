import 'server-only';

import type {
  KycCaseEvidence,
  KycDocument,
  KycProviderCheck,
  KycReviewProviderConnector,
} from '@/features/kyc/types';

import { kycProviderConnector } from './kyc-provider';

/**
 * Reviewer-facing KYC provider evidence.
 *
 * The authoritative case fields (status, risk, sanctions/PEP signals, timestamps) are read
 * from the existing `kycProviderConnector` rather than duplicated here; this module only adds
 * the referral reason and the document/check breakdown a human reviewer needs, which the
 * frozen `KycEvidence` shape does not carry.
 */

const EPOCH = Date.parse('2026-01-05T09:00:00.000Z');
const hoursAgo = (n: number) => new Date(EPOCH - n * 60 * 60 * 1000);

interface ReviewContext {
  referralReason: string;
  documents: KycDocument[];
  checks: KycProviderCheck[];
}

const REVIEW_CONTEXT: Record<string, ReviewContext> = {
  kyc_case_5001: {
    referralReason: 'Enhanced due-diligence sample: 1 in 50 verified onboardings is reviewed.',
    documents: [
      { kind: 'Identity document', status: 'received', required: true, receivedAt: hoursAgo(30) },
      { kind: 'Proof of address', status: 'received', required: true, receivedAt: hoursAgo(30) },
      { kind: 'Source of funds', status: 'received', required: false, receivedAt: hoursAgo(28) },
    ],
    checks: [
      { name: 'Document authenticity', outcome: 'pass', detail: 'Passport MRZ verified', completedAt: hoursAgo(29) },
      { name: 'Sanctions screening', outcome: 'pass', detail: 'No match', completedAt: hoursAgo(29) },
      { name: 'PEP screening', outcome: 'pass', detail: 'No match', completedAt: hoursAgo(29) },
    ],
  },
  kyc_case_5002: {
    referralReason: 'Proof of address missing after two provider requests.',
    documents: [
      { kind: 'Identity document', status: 'received', required: true, receivedAt: hoursAgo(35) },
      { kind: 'Proof of address', status: 'missing', required: true, receivedAt: null },
      { kind: 'Source of funds', status: 'received', required: false, receivedAt: hoursAgo(35) },
    ],
    checks: [
      { name: 'Document authenticity', outcome: 'review', detail: 'Address document not supplied', completedAt: hoursAgo(34) },
      { name: 'Sanctions screening', outcome: 'pass', detail: 'No match', completedAt: hoursAgo(34) },
      { name: 'PEP screening', outcome: 'pass', detail: 'No match', completedAt: hoursAgo(34) },
    ],
  },
  kyc_case_5003: {
    referralReason: 'PEP screening returned a probable match on a regional office holder.',
    documents: [
      { kind: 'Identity document', status: 'received', required: true, receivedAt: hoursAgo(47) },
      { kind: 'Proof of address', status: 'received', required: true, receivedAt: hoursAgo(47) },
      { kind: 'Source of funds', status: 'received', required: true, receivedAt: hoursAgo(46) },
    ],
    checks: [
      { name: 'Document authenticity', outcome: 'pass', detail: 'National ID verified', completedAt: hoursAgo(46) },
      { name: 'Sanctions screening', outcome: 'pass', detail: 'No match', completedAt: hoursAgo(46) },
      { name: 'PEP screening', outcome: 'fail', detail: 'Probable match, 88% confidence', completedAt: hoursAgo(46) },
    ],
  },
  kyc_case_5004: {
    referralReason: 'Sanctions screening returned a match requiring manual adjudication.',
    documents: [
      { kind: 'Identity document', status: 'received', required: true, receivedAt: hoursAgo(71) },
      { kind: 'Proof of address', status: 'received', required: true, receivedAt: hoursAgo(71) },
      { kind: 'Source of funds', status: 'received', required: true, receivedAt: hoursAgo(70) },
    ],
    checks: [
      { name: 'Document authenticity', outcome: 'pass', detail: 'Passport verified', completedAt: hoursAgo(70) },
      { name: 'Sanctions screening', outcome: 'fail', detail: 'Match on consolidated list, 94% confidence', completedAt: hoursAgo(70) },
      { name: 'PEP screening', outcome: 'pass', detail: 'No match', completedAt: hoursAgo(70) },
    ],
  },
  kyc_case_5005: {
    referralReason: 'Transaction profile does not match the declared business activity.',
    documents: [
      { kind: 'Identity document', status: 'received', required: true, receivedAt: hoursAgo(95) },
      { kind: 'Proof of address', status: 'received', required: true, receivedAt: hoursAgo(95) },
      { kind: 'Source of funds', status: 'received', required: true, receivedAt: hoursAgo(94) },
    ],
    checks: [
      { name: 'Document authenticity', outcome: 'pass', detail: 'National ID verified', completedAt: hoursAgo(94) },
      { name: 'Sanctions screening', outcome: 'pass', detail: 'No match', completedAt: hoursAgo(94) },
      { name: 'PEP screening', outcome: 'pass', detail: 'No match', completedAt: hoursAgo(94) },
    ],
  },
  kyc_case_5006: {
    referralReason: 'Sanctions and PEP screening both returned matches; provider rejected.',
    documents: [
      { kind: 'Identity document', status: 'received', required: true, receivedAt: hoursAgo(119) },
      { kind: 'Proof of address', status: 'expired', required: true, receivedAt: hoursAgo(119) },
      { kind: 'Source of funds', status: 'received', required: true, receivedAt: hoursAgo(118) },
    ],
    checks: [
      { name: 'Document authenticity', outcome: 'review', detail: 'Address document expired', completedAt: hoursAgo(118) },
      { name: 'Sanctions screening', outcome: 'fail', detail: 'Match on consolidated list, 91% confidence', completedAt: hoursAgo(118) },
      { name: 'PEP screening', outcome: 'fail', detail: 'Probable match, 76% confidence', completedAt: hoursAgo(118) },
    ],
  },
};

function withReviewContext(providerCaseRef: string): KycCaseEvidence | null {
  const base = kycProviderConnector.getCase(providerCaseRef);
  const context = REVIEW_CONTEXT[providerCaseRef];
  if (!base || !context) return null;
  return { ...base, ...structuredClone(context) };
}

export const kycReviewProviderConnector: KycReviewProviderConnector = {
  getCase(providerCaseRef: string) {
    return kycProviderConnector.getCase(providerCaseRef);
  },
  listOpenCases() {
    return kycProviderConnector.listOpenCases();
  },
  getCaseEvidence(providerCaseRef: string): KycCaseEvidence | null {
    return withReviewContext(providerCaseRef);
  },
  listCaseEvidence(): KycCaseEvidence[] {
    return Object.keys(REVIEW_CONTEXT)
      .map(withReviewContext)
      .filter((evidence): evidence is KycCaseEvidence => evidence !== null);
  },
};
