/**
 * Development database.
 *
 * Runs PostgreSQL in-process via PGlite and exposes it on a TCP port, so Prisma,
 * `prisma migrate`, the seed and the integration tests all connect to it exactly
 * as they would to a real server. Nothing above this file knows the difference.
 *
 * This is real PostgreSQL compiled to WebAssembly — not a mock. The GiST
 * exclusion constraint the booking engine depends on works here, which is what
 * makes it a legitimate stand-in until a hosted database is wired up.
 *
 *   node scripts/dev-db.mjs            persistent, data kept in .pgdata/
 *   node scripts/dev-db.mjs --fresh    wipe first, for a clean migrate + seed
 *
 * Not for production: single-process, and the port is bound to localhost only.
 */
import { rm } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";

const PORT = Number(process.env.DEV_DB_PORT ?? 5433);
const DATA_DIR = ".pgdata";

if (process.argv.includes("--fresh")) {
  await rm(DATA_DIR, { recursive: true, force: true });
  console.log(`[dev-db] wiped ${DATA_DIR}`);
}

const db = await PGlite.create({
  dataDir: DATA_DIR,
  extensions: { btree_gist },
});

// The migration issues CREATE EXTENSION itself; loading it here makes the
// extension available for that statement to succeed.
await db.exec("CREATE EXTENSION IF NOT EXISTS btree_gist;");

const server = new PGLiteSocketServer({ db, port: PORT, host: "127.0.0.1" });
await server.start();

console.log(`[dev-db] PostgreSQL ready on 127.0.0.1:${PORT}`);
console.log(`[dev-db] connection string: postgresql://postgres:postgres@127.0.0.1:${PORT}/postgres`);
console.log("[dev-db] Ctrl+C to stop");

const shutdown = async () => {
  console.log("\n[dev-db] stopping");
  await server.stop().catch(() => {});
  await db.close().catch(() => {});
  process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
