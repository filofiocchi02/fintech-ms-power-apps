import 'server-only';

import { paymentsConnector, type PaymentRefund } from '@/lib/integrations/mock/payments';
import type { PaymentsConnector } from '@/lib/integrations/types';

/**
 * Local extension of the frozen `PaymentsConnector` contract.
 *
 * The refunds detail view has to show the payment's own refund history next to the app's
 * audit trail, and `PaymentsConnector` does not declare a read for it. Rather than edit the
 * frozen interface from a feature branch, the app depends on this adapter; the desired
 * shared change (adding `listRefunds` to `PaymentsConnector`) is described in the PR.
 */
export interface RefundsPaymentsConnector extends PaymentsConnector {
  listRefunds(paymentRef: string): PaymentRefund[];
}

export type { PaymentRefund };

export const refundsPaymentsConnector: RefundsPaymentsConnector = paymentsConnector;
