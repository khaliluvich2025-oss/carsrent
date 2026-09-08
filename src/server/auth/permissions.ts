import type { Role } from "@prisma/client";

/**
 * The single source of truth for what each role may do (spec §5, §64, §97.17).
 *
 * Only OWNER and EMPLOYEE exist (spec §97.14). Employees run daily operations;
 * they never see financial analytics, pricing, expenses, reports, agency
 * settings, branding, the team, or the audit log.
 *
 * This is enforced server-side. Hiding a control in the UI is a convenience,
 * never the control itself.
 */
export const PERMISSIONS = [
  "dashboard.view",
  "dashboard.financials",

  "reservations.view",
  "reservations.manage",
  "reservations.cancel",
  "calendar.view",

  "fleet.view",
  "fleet.manage",

  "customers.view",
  "customers.manage",

  "pickup.perform",
  "returns.perform",
  "inspections.perform",
  "documents.verify",

  "payments.record",
  "payments.refund",
  "deposits.manage",
  "charges.manage",

  "contracts.generate",
  "contracts.settings",

  "maintenance.view",
  "maintenance.manage",
  "expenses.view",
  "expenses.manage",

  "reports.view",
  "reports.export",

  "pricing.manage",
  "pricing.override",
  "locations.manage",

  "employees.manage",
  "settings.manage",
  "branding.manage",
  "audit.view",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const EMPLOYEE_PERMISSIONS: readonly Permission[] = [
  "dashboard.view",

  "reservations.view",
  "reservations.manage",
  "reservations.cancel",
  "calendar.view",

  // Operational vehicle information only — no pricing, no fleet editing (spec §5)
  "fleet.view",

  "customers.view",
  "customers.manage",

  "pickup.perform",
  "returns.perform",
  "inspections.perform",
  "documents.verify",

  // Payments and deposits required during operations (spec §5). Refunds are
  // deliberately excluded — they move money back out.
  "payments.record",
  "deposits.manage",
  "charges.manage",

  "contracts.generate",

  "maintenance.view",
];

const ROLE_PERMISSIONS: Record<Role, ReadonlySet<Permission>> = {
  // Owner has full access (spec §5)
  OWNER: new Set(PERMISSIONS),
  EMPLOYEE: new Set(EMPLOYEE_PERMISSIONS),
};

export function can(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].has(permission);
}

export function permissionsFor(role: Role): Permission[] {
  return [...ROLE_PERMISSIONS[role]];
}
