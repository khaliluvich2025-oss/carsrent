# Car Rental SaaS

Multi-agency rental operations platform: a branded client website per agency, plus
a dashboard for the agency Owner and Employees.

- [`docs/SPEC.md`](docs/SPEC.md) — the master build specification (source of truth
  for business rules)
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — architecture, security model,
  decisions and assumptions
- [`docs/CHECKLIST.md`](docs/CHECKLIST.md) — phase-by-phase implementation progress
- [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) — deploying to Vercel: database,
  object storage and environment variables

## Stack

Next.js 16 · React 19 · TypeScript · Tailwind CSS v4 · PostgreSQL · Prisma 7

## Getting started

**1. Create a Postgres database.** Any Postgres 14+ instance works. On Neon or
Supabase, grab both the pooled and the direct (non-pooler) connection strings.

**2. Configure the environment.** `.env` is gitignored, so a fresh clone has
none — create one and generate a session secret:

```bash
cp .env.example .env
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Put that value in `SESSION_SECRET`, then fill in the database URLs:

```bash
DATABASE_URL="postgresql://...:5432/rental?sslmode=require"   # pooled — used at runtime
DIRECT_URL="postgresql://...:5432/rental?sslmode=require"     # direct — used by migrations
```

[`.env.example`](.env.example) documents the rest, including object storage.
Nothing starts without `DATABASE_URL` and `SESSION_SECRET`: `src/env.ts`
validates the environment on import and throws rather than letting a
half-configured app reach a request.

**3. Apply the schema and seed a demo agency:**

```bash
npm run db:migrate
```

```bash
npm run db:seed
```

The seed prints the demo credentials. Change them before this touches real data.

**4. Run it:**

```bash
npm run dev
```

Then open `http://localhost:3000/atlas-cars/login`.

## URL shape

Everything is tenant-scoped by URL:

| Path                  | What                |
| --------------------- | ------------------- |
| `/{slug}`             | Public rental site  |
| `/{slug}/login`       | Staff sign-in       |
| `/{slug}/dashboard`   | Agency dashboard    |

Setting `APP_ROOT_DOMAIN` additionally makes `{slug}.yourdomain.com` resolve to the
same pages (`src/proxy.ts`).

## Scripts

| Command             | What it does                                  |
| ------------------- | --------------------------------------------- |
| `npm run dev`       | Development server                            |
| `npm run build`     | Generate the Prisma client, then build         |
| `npm test`          | Vitest — business-logic and isolation tests    |
| `npm run typecheck` | `tsc --noEmit`                                 |
| `npm run lint`      | ESLint                                         |
| `npm run db:migrate`| Create/apply migrations (dev)                  |
| `npm run db:deploy` | Apply migrations (production)                  |
| `npm run db:seed`   | Seed a demo agency                             |
| `npm run db:studio` | Prisma Studio                                  |

## Continuous integration

`.github/workflows/ci.yml` runs on every push to `main` and every pull request:
lint, typecheck, the full test suite, then the production build — the same
sequence Vercel would fail on, but before the deploy rather than during it.

It brings up a **real PostgreSQL 16 service container** rather than the embedded
development database. That matters for one suite in particular: the
double-booking tests race transactions against the GiST exclusion constraint,
and a race needs genuine parallelism to prove anything, so against PGlite the
two racing tests skip themselves. In CI they run.

## A note on the database

`vehicle_blocks` is the single source of vehicle occupancy, and it carries a GiST
exclusion constraint that makes two overlapping blocks for the same vehicle
**impossible to commit**. That constraint — not application code — is what
guarantees no double booking under concurrency. It requires the `btree_gist`
extension, which the initial migration creates. Do not drop either.

## Running it locally without installing PostgreSQL

The project ships with an embedded development database, so `npm install`, an
`.env` and three commands are enough to see the whole product working.

Write the whole `.env` in one go — the connection string is fixed by the
embedded database, and the secret is generated inline:

```bash
cat > .env <<EOF
DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:5433/postgres"
DIRECT_URL="postgresql://postgres:postgres@127.0.0.1:5433/postgres"
DATABASE_POOL_MAX="1"
DEV_DB_CONCURRENCY_LIMITED="1"
SESSION_SECRET="$(node -e "console.log(require('crypto').randomBytes(32).toString('base64'))")"
STORAGE_DRIVER="local"
APP_URL="http://localhost:3000"
EOF
```

Then:

```bash
npm run db:dev:fresh
```

That starts **real PostgreSQL** — PGlite, the Postgres engine compiled to
WebAssembly — and exposes it on `127.0.0.1:5433`, persisted to `.pgdata/`.
Prisma, migrations, the seed and the app all connect to it exactly as they would
to a hosted server. Leave it running in its own terminal.

Then, in a second terminal:

```bash
npm run db:deploy && npm run db:seed && npm run dev
```

Open `http://localhost:3000/atlas-cars` for the customer website, or
`http://localhost:3000/atlas-cars/login` for the staff dashboard. The seed prints
the demo credentials.

### Limits of the development database

PGlite is a single-threaded engine, which is fine for browsing and for every
workflow in the product, but three things differ from a real server:

- It cannot serve genuinely parallel transactions, which is why `.env` above sets
  `DATABASE_POOL_MAX="1"` — that makes queries queue instead of colliding.
- The two racing tests in the double-booking suite skip themselves, because a
  race needs real parallelism to mean anything.
- It serves **one connection at a time**, and the app wants two: route handlers
  and pages are separate bundles, so each holds its own Prisma pool. Whichever
  connection is displaced fails with `Connection terminated unexpectedly`. In
  practice that means the CSV export route 500s once a dashboard page has
  rendered, and the integration suite fails a different test on most runs. Both
  disappear against a real server — neither is a fault in the app.

Point `DATABASE_URL` and `DIRECT_URL` at a hosted PostgreSQL, drop
`DATABASE_POOL_MAX` and `DEV_DB_CONCURRENCY_LIMITED`, and the full suite runs:
325 tests, nothing skipped. Anything that has to be *trusted* — the booking
guarantee above all — should be judged there or in CI, not here.
