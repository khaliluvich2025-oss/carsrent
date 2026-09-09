import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

import { env, isProduction } from "@/env";

/**
 * The UNSCOPED Prisma client.
 *
 * Reach for this only where there is genuinely no tenant yet:
 *   - authentication (looking a user up by username before a session exists)
 *   - session verification
 *   - resolving an agency from a slug or host for the public website
 *   - agency provisioning / seeding
 *
 * Everything else must go through `getTenantDb()` from `./tenant`, which
 * physically cannot emit a query that crosses agency boundaries.
 */
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createClient(): PrismaClient {
  // Prisma 7 runs on the query compiler, so the connection is owned by a driver
  // adapter rather than by the schema. DATABASE_URL is the pooled URL.
  const adapter = new PrismaPg({
    connectionString: env.DATABASE_URL,
    // Unset in production, where the pg default applies. Pinned to 1
    // against the single-threaded development database.
    ...(env.DATABASE_POOL_MAX ? { max: env.DATABASE_POOL_MAX } : {}),
  });

  return new PrismaClient({
    adapter,
    log: isProduction ? ["error"] : ["error", "warn"],
  });
}

export const db = globalForPrisma.prisma ?? createClient();

if (!isProduction) {
  // Survive HMR in development without opening a new pool on every reload.
  globalForPrisma.prisma = db;
}
