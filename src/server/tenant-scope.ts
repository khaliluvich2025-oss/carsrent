/**
 * The pure half of tenant isolation: given a Prisma operation, return the
 * arguments rewritten to carry `agencyId`.
 *
 * Kept free of any Prisma client import so it can be unit-tested directly —
 * this is the rule that stops one agency reading another's data, and it should
 * be provable without standing up a database.
 */

/** Models that carry an `agencyId` column. */
export const TENANT_SCOPED_MODELS = new Set([
  "AgencySettings",
  "ContractSettings",
  "WorkingHours",
  "User",
  "StoredFile",
  "Vehicle",
  "VehicleImage",
  "VehicleBlock",
  "Location",
  "SeasonalRate",
  "Extra",
  "Customer",
  "CustomerDocument",
  "CustomerNote",
  "Reservation",
  "ReservationStatusHistory",
  "ReservationChange",
  "ReservationExtra",
  "Payment",
  "SecurityDeposit",
  "AdditionalCharge",
  "Inspection",
  "InspectionPhoto",
  "DamageRecord",
  "DamagePhoto",
  "Contract",
  "Signature",
  "MaintenanceRecord",
  "MaintenanceBlock",
  "VehicleExpense",
  "Notification",
  "AuditLog",
]);

/**
 * Models with no `agencyId`. `Agency` is keyed by `id`; `Session` is reached
 * through its user. Both are deliberately excluded from rewriting.
 */
export const UNSCOPED_MODELS = new Set(["Agency", "Session"]);

/** Operations whose `where` should be narrowed to the tenant. */
const WHERE_OPERATIONS = new Set([
  "findUnique",
  "findUniqueOrThrow",
  "findFirst",
  "findFirstOrThrow",
  "findMany",
  "count",
  "aggregate",
  "groupBy",
  "updateMany",
  "deleteMany",
  "update",
  "delete",
]);

/** Operations whose `data` should be stamped with the tenant. */
const DATA_OPERATIONS = new Set(["create", "createMany", "createManyAndReturn"]);

type AnyArgs = Record<string, unknown>;

export class UnclassifiedModelError extends Error {
  constructor(model: string) {
    super(
      `Model "${model}" is not classified in src/server/tenant-scope.ts. ` +
        `Add it to TENANT_SCOPED_MODELS or UNSCOPED_MODELS before querying it.`,
    );
    this.name = "UnclassifiedModelError";
  }
}

function stampData(data: unknown, agencyId: string): unknown {
  if (Array.isArray(data)) {
    return data.map((row) => stampData(row, agencyId));
  }
  if (data && typeof data === "object") {
    const row = data as AnyArgs;
    // A caller using the nested `agency: { connect }` form has already been
    // explicit; don't produce a conflicting scalar alongside it.
    if ("agency" in row) return row;
    return { ...row, agencyId };
  }
  return { agencyId };
}

/**
 * Rewrite one operation's arguments for the given tenant.
 *
 * `agencyId` is applied last and unconditionally, so a caller that passes its
 * own `agencyId` is overridden rather than trusted.
 */
export function applyTenantScope<T>(
  model: string,
  operation: string,
  args: T,
  agencyId: string,
): T {
  if (!agencyId) throw new Error("applyTenantScope called without an agencyId");

  if (UNSCOPED_MODELS.has(model)) return args;
  if (!TENANT_SCOPED_MODELS.has(model)) throw new UnclassifiedModelError(model);

  const next: AnyArgs = { ...((args as AnyArgs) ?? {}) };

  if (WHERE_OPERATIONS.has(operation)) {
    // Prisma 5+ accepts extra non-unique filters alongside a unique key, so this
    // works uniformly for findUnique/update/delete too.
    next.where = { ...((next.where as AnyArgs) ?? {}), agencyId };
  }

  if (DATA_OPERATIONS.has(operation) && "data" in next) {
    next.data = stampData(next.data, agencyId);
  }

  if (operation === "upsert") {
    next.where = { ...((next.where as AnyArgs) ?? {}), agencyId };
    next.create = stampData(next.create, agencyId);
  }

  return next as T;
}
