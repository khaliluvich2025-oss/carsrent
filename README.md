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

**2. Configure the environment.** `.env` already exists with a generated
`SESSION_SECRET`; fill in the database URLs:

```bash
DATABASE_URL="postgresql://...:5432/rental?sslmode=require"   # pooled — used at runtime
DIRECT_URL="postgresql://...:5432/rental?sslmode=require"     # direct — used by migrations
```

See [`.env.example`](.env.example) for the full list, including object storage.

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

## A note on the database

`vehicle_blocks` is the single source of vehicle occupancy, and it carries a GiST
exclusion constraint that makes two overlapping blocks for the same vehicle
**impossible to commit**. That constraint — not application code — is what
guarantees no double booking under concurrency. It requires the `btree_gist`
extension, which the initial migration creates. Do not drop either.

## Running it locally without installing PostgreSQL

The project ships with an embedded development database, so `npm install` and
three commands are enough to see the whole product working.

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
workflow in the product, but two things differ from a real server:

- It cannot serve genuinely parallel transactions, so `DATABASE_POOL_MAX="1"` is
  set in `.env` to make queries queue.
- The two racing tests in the double-booking suite skip themselves, because a
  race needs real parallelism to mean anything. Everything else in that suite —
  the exclusion constraint, buffers, maintenance conflicts, expiring holds and
  tenant isolation — runs and passes against it.

Point `DATABASE_URL` and `DIRECT_URL` at a hosted PostgreSQL, drop
`DATABASE_POOL_MAX` and `DEV_DB_CONCURRENCY_LIMITED`, and the full suite runs.
