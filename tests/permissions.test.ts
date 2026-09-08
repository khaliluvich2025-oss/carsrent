import { describe, expect, it } from "vitest";

import { can, PERMISSIONS, permissionsFor } from "@/server/auth/permissions";

/**
 * spec §5, §64, §97.14, §97.17 — only two roles exist, and an Employee must not
 * reach Owner financial analytics or system settings.
 */
describe("role permissions", () => {
  it("gives the Owner everything", () => {
    for (const permission of PERMISSIONS) {
      expect(can("OWNER", permission), permission).toBe(true);
    }
  });

  it("lets an Employee run daily operations", () => {
    const allowed = [
      "reservations.view",
      "reservations.manage",
      "calendar.view",
      "customers.manage",
      "pickup.perform",
      "returns.perform",
      "inspections.perform",
      "documents.verify",
      "payments.record",
      "deposits.manage",
      "contracts.generate",
    ] as const;

    for (const permission of allowed) {
      expect(can("EMPLOYEE", permission), permission).toBe(true);
    }
  });

  it("keeps Owner-only surfaces away from an Employee", () => {
    const denied = [
      "dashboard.financials",
      "reports.view",
      "reports.export",
      "expenses.view",
      "expenses.manage",
      "pricing.manage",
      "pricing.override",
      "locations.manage",
      "fleet.manage",
      "employees.manage",
      "settings.manage",
      "branding.manage",
      "contracts.settings",
      "maintenance.manage",
      "payments.refund",
      "audit.view",
    ] as const;

    for (const permission of denied) {
      expect(can("EMPLOYEE", permission), permission).toBe(false);
    }
  });

  it("gives the Employee strictly fewer permissions than the Owner", () => {
    const owner = permissionsFor("OWNER");
    const employee = permissionsFor("EMPLOYEE");

    expect(employee.length).toBeLessThan(owner.length);
    for (const permission of employee) {
      expect(owner).toContain(permission);
    }
  });
});
