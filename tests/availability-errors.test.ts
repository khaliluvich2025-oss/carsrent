import { describe, expect, it } from "vitest";

import {
  isVehicleOverlapViolation,
  rethrowAsAvailabilityError,
  VehicleUnavailableError,
} from "@/server/services/availability/errors";

/**
 * The detector has to recognise the same failure across several error shapes,
 * because Prisma surfaces driver errors differently depending on whether it maps
 * them to a known code, wraps them in the adapter, or passes them through raw.
 *
 * The integration test in tests/integration/ proves which shape actually arrives;
 * these cases pin the ones we must keep handling.
 */
function pgError() {
  return Object.assign(
    new Error(
      'conflicting key value violates exclusion constraint "vehicle_blocks_no_overlap"',
    ),
    { code: "23P01", constraint: "vehicle_blocks_no_overlap" },
  );
}

describe("exclusion violation detection", () => {
  it("recognises a raw driver error by SQLSTATE", () => {
    expect(isVehicleOverlapViolation(pgError())).toBe(true);
  });

  it("recognises it by constraint name alone", () => {
    const error = Object.assign(new Error("insert failed"), {
      constraint: "vehicle_blocks_no_overlap",
    });
    expect(isVehicleOverlapViolation(error)).toBe(true);
  });

  it("recognises a Prisma known-request error carrying meta", () => {
    const error = Object.assign(new Error("Raw query failed"), {
      name: "PrismaClientKnownRequestError",
      code: "P2010",
      meta: { code: "23P01", message: "conflicting key value" },
    });
    expect(isVehicleOverlapViolation(error)).toBe(true);
  });

  it("recognises it when only the message mentions the constraint", () => {
    const error = new Error(
      'Invalid `prisma.vehicleBlock.create()`: exclusion constraint "vehicle_blocks_no_overlap"',
    );
    expect(isVehicleOverlapViolation(error)).toBe(true);
  });

  it("looks through a wrapped cause chain", () => {
    const wrapped = new Error("Transaction failed", { cause: pgError() });
    const doubleWrapped = new Error("Query failed", { cause: wrapped });
    expect(isVehicleOverlapViolation(doubleWrapped)).toBe(true);
  });

  it("does not mistake a unique violation for an overlap", () => {
    const error = Object.assign(new Error("duplicate key value"), {
      code: "23505",
      constraint: "reservations_agencyId_bookingReference_key",
    });
    expect(isVehicleOverlapViolation(error)).toBe(false);
  });

  it("ignores unrelated failures", () => {
    expect(isVehicleOverlapViolation(new Error("connection refused"))).toBe(false);
    expect(isVehicleOverlapViolation(null)).toBe(false);
    expect(isVehicleOverlapViolation(undefined)).toBe(false);
    expect(isVehicleOverlapViolation("23P01")).toBe(false);
  });

  it("survives a self-referential cause chain", () => {
    const error = new Error("loop") as Error & { cause?: unknown };
    error.cause = error;
    expect(() => isVehicleOverlapViolation(error)).not.toThrow();
    expect(isVehicleOverlapViolation(error)).toBe(false);
  });
});

describe("rethrowAsAvailabilityError", () => {
  it("converts an overlap into the customer-facing error", () => {
    const original = pgError();
    try {
      rethrowAsAvailabilityError(original);
      expect.unreachable("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(VehicleUnavailableError);
      expect((error as VehicleUnavailableError).code).toBe("VEHICLE_UNAVAILABLE");
      expect((error as Error).message).toContain("no longer available");
      expect((error as VehicleUnavailableError).cause).toBe(original);
    }
  });

  it("rethrows a genuine fault untouched rather than disguising it", () => {
    const original = new Error("connection terminated unexpectedly");
    expect(() => rethrowAsAvailabilityError(original)).toThrow(original);

    try {
      rethrowAsAvailabilityError(original);
    } catch (error) {
      expect(error).not.toBeInstanceOf(VehicleUnavailableError);
    }
  });
});
