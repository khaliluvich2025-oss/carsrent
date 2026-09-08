import { db } from "./db";
import { applyTenantScope } from "./tenant-scope";

/**
 * Tenant isolation, layer 2 (see docs/ARCHITECTURE.md §3).
 *
 * `getTenantDb(agencyId)` returns a Prisma client whose every query is rewritten
 * to carry `agencyId`. Reads get it in `where`, writes get it in `data`. Callers
 * cannot forget it, and a caller that passes a *different* agencyId is overridden
 * rather than trusted — the session is the only source of tenant identity.
 *
 * The rewriting rules live in `./tenant-scope` and are unit-tested there.
 *
 * The client also exposes its own tenant as `$agencyId`. Prisma's generated
 * types still require `agencyId` on a create even though the extension supplies
 * it at runtime, so services write `agencyId: db.$agencyId` — one source, no
 * casts, and the runtime override remains the actual guarantee if a caller ever
 * passes the wrong value.
 */
export type TenantDb = ReturnType<typeof getTenantDb>;

export function getTenantDb(agencyId: string) {
  if (!agencyId) {
    throw new Error("getTenantDb called without an agencyId");
  }

  return db.$extends({
    name: "tenant-scope",
    client: {
      $agencyId: agencyId,
    },
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          return query(applyTenantScope(model, operation, args, agencyId));
        },
      },
    },
  });
}
