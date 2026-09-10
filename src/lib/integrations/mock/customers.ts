import 'server-only';

import type { Customer, CustomerConnector } from '../types';

const CUSTOMERS: Customer[] = [
  { ref: 'cus_1001', displayName: 'Acme Corp', emailDomain: 'acme.example', region: 'GB', accountStatus: 'active' },
  { ref: 'cus_1002', displayName: 'Beta Ltd', emailDomain: 'beta.example', region: 'GB', accountStatus: 'active' },
  { ref: 'cus_1003', displayName: 'Gamma SA', emailDomain: 'gamma.example', region: 'FR', accountStatus: 'active' },
  { ref: 'cus_1004', displayName: 'Delta LLC', emailDomain: 'delta.example', region: 'US', accountStatus: 'suspended' },
  { ref: 'cus_1005', displayName: 'Epsilon AB', emailDomain: 'epsilon.example', region: 'SE', accountStatus: 'active' },
  { ref: 'cus_1006', displayName: 'Zeta GmbH', emailDomain: 'zeta.example', region: 'DE', accountStatus: 'active' },
];

export const customerConnector: CustomerConnector = {
  getCustomer(ref: string): Customer | null {
    const customer = CUSTOMERS.find((c) => c.ref === ref);
    return customer ? structuredClone(customer) : null;
  },
  listCustomers(): Customer[] {
    return CUSTOMERS.map((c) => structuredClone(c));
  },
};
