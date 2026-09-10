/**
 * Capability model for the internal-tools console.
 *
 * The model separates *app access* (can this role open the tool?) from *action permissions*
 * (can this role perform this specific mutation?). Page and API guards check the former;
 * handlers for sensitive actions check the latter independently.
 *
 * This file is frozen once the foundation PR merges. Feature sessions import these
 * constants; they do not redefine roles or capabilities, because hidden UI checks and
 * duplicated permission matrices are where security boundaries rot.
 */

/** Roles used by the demo cookie / RoleSwitcher. */
export const ROLES = [
  'support',
  'compliance',
  'release-engineer',
  'manager-admin',
] as const;
export type Role = (typeof ROLES)[number];

/** Short human-readable labels for the shell and audit logs. */
export const ROLE_LABELS: Record<Role, string> = {
  support: 'Support Agent',
  compliance: 'Compliance Analyst',
  'release-engineer': 'Release Engineer',
  'manager-admin': 'Manager / Admin',
};

/**
 * Apps in the console. Each feature session owns one primary app; `audit` and `platform`
 * are cross-cutting.
 */
export const APPS = ['kyc', 'refunds', 'flags', 'platform'] as const;
export type App = (typeof APPS)[number];

/** Action permissions, scoped by app. Page access does not imply action permission. */
export const APP_ACTIONS = {
  kyc: ['kyc:read', 'kyc:assign', 'kyc:decide'],
  refunds: ['refunds:read', 'refunds:request', 'refunds:approve', 'refunds:execute'],
  flags: ['flags:read', 'flags:write'],
  platform: ['platform:admin'],
} as const;

export type AppAction = {
  [K in keyof typeof APP_ACTIONS]: (typeof APP_ACTIONS)[K][number];
}[keyof typeof APP_ACTIONS];

export type Capability = App | AppAction;

const ALL_APP_ACTIONS: Record<App, readonly AppAction[]> = APP_ACTIONS;

/**
 * Which apps each role may open. This is the page/API access matrix; action checks are
 * separate and more granular.
 */
export const ROLE_APP_ACCESS: Record<Role, readonly App[]> = {
  support: ['refunds'],
  compliance: ['kyc'],
  'release-engineer': ['flags'],
  'manager-admin': ['kyc', 'refunds', 'flags', 'platform'],
};

/**
 * Which action permissions each role holds. Page access does not imply action permission.
 */
export const ROLE_ACTIONS: Record<Role, readonly AppAction[]> = {
  support: ['refunds:read', 'refunds:request'],
  compliance: ['kyc:read', 'kyc:assign', 'kyc:decide'],
  'release-engineer': ['flags:read', 'flags:write'],
  'manager-admin': Object.values(ALL_APP_ACTIONS).flat() as AppAction[],
};

/** Whether the role may open the given app. */
export function canAccessApp(role: Role, app: App): boolean {
  return ROLE_APP_ACCESS[role].includes(app);
}

/** Whether the role holds the given action permission. */
export function canPerformAction(role: Role, action: AppAction): boolean {
  return ROLE_ACTIONS[role].includes(action);
}

/** Ordered list of apps the shell should show for this role. */
export function appsForRole(role: Role): App[] {
  return APPS.filter((app) => canAccessApp(role, app));
}

/** Is this one of the well-known roles? Useful when parsing the demo cookie. */
export function isKnownRole(value: string): value is Role {
  return (ROLES as readonly string[]).includes(value);
}
