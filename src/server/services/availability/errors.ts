/**
 * Turning a database constraint violation into a customer-facing answer.
 *
 * `vehicle_blocks_no_overlap` is the GiST exclusion constraint that makes two
 * overlapping blocks for the same vehicle impossible to commit. When two
 * checkouts race, the loser's INSERT raises SQLSTATE 23P01 — that is not a bug
 * to log and swallow, it is the expected outcome of spec §92 and must surface as
 * "this vehicle is no longer available for the selected period".
 *
 * Detection is deliberately broad. Prisma reports driver errors differently
 * depending on whether the failure is mapped to a known error code, wrapped by
 * the driver adapter, or surfaced raw, so we look for the SQLSTATE and the
 * constraint name anywhere in the error chain rather than pinning to one shape.
 */

export const OVERLAP_CONSTRAINT = "vehicle_blocks_no_overlap";
export const SQLSTATE_EXCLUSION_VIOLATION = "23P01";

/** The reservation layer's answer to a lost race (spec §20, §92). */
export class VehicleUnavailableError extends Error {
  readonly code = "VEHICLE_UNAVAILABLE";

  constructor(
    message = "This vehicle is no longer available for the selected period.",
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = "VehicleUnavailableError";
  }
}

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null;
}

/** Walk `cause` chains without looping forever on a self-referential error. */
function* errorChain(error: unknown, maxDepth = 8): Generator<UnknownRecord> {
  const seen = new Set<unknown>();
  let current = error;

  for (let depth = 0; depth < maxDepth; depth += 1) {
    if (!isRecord(current) || seen.has(current)) return;
    seen.add(current);
    yield current;
    current = current.cause;
  }
}

function mentionsOverlap(value: unknown): boolean {
  return (
    typeof value === "string" &&
    (value.includes(OVERLAP_CONSTRAINT) ||
      value.includes(SQLSTATE_EXCLUSION_VIOLATION))
  );
}

/**
 * True when this error is the exclusion constraint rejecting an overlapping
 * block — i.e. somebody else booked the vehicle first.
 */
export function isVehicleOverlapViolation(error: unknown): boolean {
  for (const node of errorChain(error)) {
    // Raw driver error: { code: '23P01', constraint: 'vehicle_blocks_no_overlap' }
    if (node.code === SQLSTATE_EXCLUSION_VIOLATION) return true;
    if (mentionsOverlap(node.constraint)) return true;

    // Prisma wraps the driver's detail in `meta`.
    if (isRecord(node.meta)) {
      if (node.meta.code === SQLSTATE_EXCLUSION_VIOLATION) return true;
      if (mentionsOverlap(node.meta.constraint)) return true;
      if (mentionsOverlap(node.meta.message)) return true;
      if (mentionsOverlap(node.meta.cause)) return true;
    }

    if (mentionsOverlap(node.message)) return true;
  }

  return false;
}

/**
 * Wrap a block-insert failure. An overlap becomes a `VehicleUnavailableError`;
 * anything else is rethrown untouched, because a genuine fault must not be
 * disguised as an availability answer.
 */
export function rethrowAsAvailabilityError(error: unknown): never {
  if (isVehicleOverlapViolation(error)) {
    throw new VehicleUnavailableError(undefined, error);
  }
  throw error;
}
