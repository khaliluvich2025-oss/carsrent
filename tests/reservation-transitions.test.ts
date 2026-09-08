import { describe, expect, it } from "vitest";
import type { ReservationStatus } from "@prisma/client";

import {
  ALLOWED_TRANSITIONS,
  BLOCKING_STATUSES,
  canTransition,
  isNoShowEligible,
  noShowEligibleAt,
} from "@/server/services/reservations/transitions";
import { toCustomerStatus } from "@/server/services/booking/lookup";

const ALL_STATUSES = Object.keys(ALLOWED_TRANSITIONS) as ReservationStatus[];

/** spec §14 */
describe("reservation lifecycle", () => {
  it("follows the typical path", () => {
    expect(canTransition("AWAITING_CONFIRMATION", "CONFIRMED")).toBe(true);
    expect(canTransition("CONFIRMED", "READY_FOR_PICKUP")).toBe(true);
    expect(canTransition("READY_FOR_PICKUP", "ACTIVE")).toBe(true);
    expect(canTransition("ACTIVE", "RETURN_DUE")).toBe(true);
    expect(canTransition("RETURN_DUE", "RETURN_INSPECTION")).toBe(true);
    expect(canTransition("RETURN_INSPECTION", "COMPLETED")).toBe(true);
  });

  it("supports the alternative flows the spec lists", () => {
    expect(canTransition("CONFIRMED", "CANCELLED")).toBe(true);
    expect(canTransition("CONFIRMED", "NO_SHOW")).toBe(true);
    expect(canTransition("ACTIVE", "OVERDUE")).toBe(true);
    expect(canTransition("OVERDUE", "RETURN_INSPECTION")).toBe(true);
  });

  it("treats closed reservations as final", () => {
    for (const terminal of ["COMPLETED", "CANCELLED", "NO_SHOW"] as const) {
      expect(ALLOWED_TRANSITIONS[terminal]).toEqual([]);
      for (const target of ALL_STATUSES) {
        expect(canTransition(terminal, target), `${terminal} -> ${target}`).toBe(
          false,
        );
      }
    }
  });

  it("refuses to jump straight from awaiting confirmation to active", () => {
    expect(canTransition("AWAITING_CONFIRMATION", "ACTIVE")).toBe(false);
    expect(canTransition("AWAITING_CONFIRMATION", "COMPLETED")).toBe(false);
    expect(canTransition("AWAITING_CONFIRMATION", "NO_SHOW")).toBe(false);
  });

  it("does not let a rental in progress be cancelled from this screen", () => {
    // A car that is already out needs the return flow, not a cancel button.
    expect(canTransition("ACTIVE", "CANCELLED")).toBe(false);
    expect(canTransition("OVERDUE", "CANCELLED")).toBe(false);
  });

  it("never allows a status to transition to itself", () => {
    for (const status of ALL_STATUSES) {
      expect(canTransition(status, status), status).toBe(false);
    }
  });

  it("holds the vehicle for exactly the live statuses", () => {
    expect(BLOCKING_STATUSES).toContain("AWAITING_CONFIRMATION");
    expect(BLOCKING_STATUSES).toContain("ACTIVE");
    expect(BLOCKING_STATUSES).toContain("OVERDUE");
    expect(BLOCKING_STATUSES).not.toContain("CANCELLED");
    expect(BLOCKING_STATUSES).not.toContain("NO_SHOW");
    expect(BLOCKING_STATUSES).not.toContain("COMPLETED");
  });
});

/** spec §54 */
describe("no-show waiting period", () => {
  const pickup = new Date("2026-09-12T10:00:00Z");

  it("computes when a no-show may be recorded", () => {
    expect(noShowEligibleAt(pickup, 120).toISOString()).toBe(
      "2026-09-12T12:00:00.000Z",
    );
  });

  it("is not eligible before the period elapses", () => {
    expect(
      isNoShowEligible(pickup, 120, new Date("2026-09-12T11:59:00Z")),
    ).toBe(false);
  });

  it("is eligible at exactly the boundary and after", () => {
    expect(
      isNoShowEligible(pickup, 120, new Date("2026-09-12T12:00:00Z")),
    ).toBe(true);
    expect(
      isNoShowEligible(pickup, 120, new Date("2026-09-12T18:00:00Z")),
    ).toBe(true);
  });

  it("is immediately eligible when the agency sets no waiting period", () => {
    expect(isNoShowEligible(pickup, 0, pickup)).toBe(true);
  });
});

/** spec §14 — customers must not see internal operational detail */
describe("customer-facing status mapping", () => {
  it("collapses the internal statuses to the five customers see", () => {
    expect(toCustomerStatus("AWAITING_CONFIRMATION")).toBe("PENDING");
    expect(toCustomerStatus("CONFIRMED")).toBe("CONFIRMED");
    expect(toCustomerStatus("READY_FOR_PICKUP")).toBe("CONFIRMED");
    expect(toCustomerStatus("ACTIVE")).toBe("ACTIVE");
    expect(toCustomerStatus("RETURN_DUE")).toBe("ACTIVE");
    expect(toCustomerStatus("RETURN_INSPECTION")).toBe("ACTIVE");
    expect(toCustomerStatus("COMPLETED")).toBe("COMPLETED");
    expect(toCustomerStatus("CANCELLED")).toBe("CANCELLED");
  });

  it("does not tell a customer their own rental is overdue", () => {
    // Chasing a late return is a phone call from the agency, not a public badge.
    expect(toCustomerStatus("OVERDUE")).toBe("ACTIVE");
  });

  it("presents a no-show as a cancellation rather than a judgement", () => {
    expect(toCustomerStatus("NO_SHOW")).toBe("CANCELLED");
  });

  it("maps every internal status to something", () => {
    for (const status of ALL_STATUSES) {
      expect(toCustomerStatus(status), status).toBeTruthy();
    }
  });
});
