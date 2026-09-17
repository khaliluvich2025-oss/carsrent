import { existsSync } from "node:fs";
import { defineConfig } from "prisma/config";

// The Prisma CLI does not load .env implicitly in v7. Node 24 can do it natively,
// so no dotenv dependency is needed. Next.js loads .env for the app itself.
//
// The guard is not optional: `loadEnvFile` throws ENOENT rather than shrugging,
// and the two places that matter most have no such file. Vercel keeps the values
// in its own dashboard, and CI puts them in the job environment — so an unguarded
// call here fails `vercel-build` on its very first step, before a migration runs.
if (existsSync(".env")) {
  process.loadEnvFile?.(".env");
}

export default defineConfig({
  schema: "prisma/schema.prisma",

  datasource: {
    // Migrations must run over a direct (unpooled) connection. On Neon/Supabase
    // that is the non-pooler host; elsewhere it is the same URL.
    url: process.env.DIRECT_URL || process.env.DATABASE_URL || "",
  },

  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
});
