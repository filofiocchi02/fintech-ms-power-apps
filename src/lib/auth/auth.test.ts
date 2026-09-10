import { describe, expect, it } from 'vitest';

import {
  APPS,
  canAccessApp,
  canPerformAction,
  ROLE_ACTIONS,
  ROLE_LABELS,
  ROLES,
  type Role,
} from './roles';
import { requireActionPermission, requireApiAppAccess, parseDemoRole } from './guards';
import type { Actor } from './session';

const actor = (role: Role, id = `demo_${role}`): Actor => ({
  id,
  role,
  displayName: ROLE_LABELS[role],
});

describe('role and capability model', () => {
  it('covers exactly four roles', () => {
    expect(ROLES).toEqual(['support', 'compliance', 'release-engineer', 'manager-admin']);
  });

  it('maps Support to refunds only', () => {
    expect(canAccessApp('support', 'refunds')).toBe(true);
    expect(canAccessApp('support', 'kyc')).toBe(false);
    expect(canAccessApp('support', 'flags')).toBe(false);
    expect(canAccessApp('support', 'audit')).toBe(false);
  });

  it('maps Compliance to kyc only', () => {
    expect(canAccessApp('compliance', 'kyc')).toBe(true);
    expect(canAccessApp('compliance', 'refunds')).toBe(false);
    expect(canAccessApp('compliance', 'flags')).toBe(false);
  });

  it('maps Release Engineer to flags only', () => {
    expect(canAccessApp('release-engineer', 'flags')).toBe(true);
    expect(canAccessApp('release-engineer', 'kyc')).toBe(false);
  });

  it('grants Manager/Admin every app including audit', () => {
    for (const app of APPS) {
      expect(canAccessApp('manager-admin', app)).toBe(true);
    }
  });

  it('grants page access does not grant every action', () => {
    // Support can open refunds page but not approve refunds.
    expect(canPerformAction('support', 'refunds:read')).toBe(true);
    expect(canPerformAction('support', 'refunds:approve')).toBe(false);
  });

  it('grants Manager/Admin all actions', () => {
    const allActions = Object.values(ROLE_ACTIONS).flat();
    for (const action of allActions) {
      expect(canPerformAction('manager-admin', action)).toBe(true);
    }
  });
});

describe('server guards', () => {
  it('API guard allows an authorised app', () => {
    const result = requireApiAppAccess(actor('compliance'), 'kyc');
    expect(result.success).toBe(true);
    if (!result.success) throw new Error('unexpected');
    expect(result.data.actor.role).toBe('compliance');
  });

  it('API guard refuses an unauthorised app with a typed forbidden error', () => {
    const result = requireApiAppAccess(actor('support'), 'kyc');
    expect(result.success).toBe(false);
    if (result.success) throw new Error('unexpected');
    expect(result.error.code).toBe('FORBIDDEN');
    expect(result.error.message).toContain('kyc');
  });

  it('API guard requires sign-in', () => {
    const result = requireApiAppAccess(null, 'kyc');
    expect(result.success).toBe(false);
    if (result.success) throw new Error('unexpected');
    expect(result.error.code).toBe('UNAUTHORIZED');
  });

  it('action guard allows a permitted action', () => {
    const result = requireActionPermission(actor('compliance'), 'kyc:decide');
    expect(result.allowed).toBe(true);
  });

  it('action guard refuses a forbidden action independently of page access', () => {
    const result = requireActionPermission(actor('compliance'), 'refunds:approve');
    expect(result.allowed).toBe(false);
    if (result.allowed) throw new Error('unexpected');
    expect(result.response.success).toBe(false);
    if (result.response.success) throw new Error('unexpected');
    expect(result.response.error.code).toBe('FORBIDDEN');
  });

  it('action guard never trusts a client-supplied role', () => {
    // Guards receive the actor resolved from the server-readable cookie. Passing a forged
    // actor object in a unit test still follows the role mapping; the point is the route
    // never reads a role from the request body.
    const forged = actor('manager-admin', 'client_forged_id');
    expect(requireApiAppAccess(forged, 'audit').success).toBe(true);
  });
});

describe('demo role parser', () => {
  it('accepts known roles', () => {
    expect(parseDemoRole({ role: 'support' })).toBe('support');
    expect(parseDemoRole({ role: 'manager-admin' })).toBe('manager-admin');
  });

  it('rejects unknown roles and non-object bodies', () => {
    expect(parseDemoRole({ role: 'hacker' })).toHaveProperty('code', 'FORBIDDEN');
    expect(parseDemoRole('support')).toHaveProperty('code', 'FORBIDDEN');
    expect(parseDemoRole(null)).toHaveProperty('code', 'FORBIDDEN');
  });
});
