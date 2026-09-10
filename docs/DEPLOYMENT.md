# Deploying to Vercel

The app is a stock Next.js 16 project, so Vercel needs no adapter and no
`vercel.json`. What it does need is a database it can reach and somewhere to put
uploaded files, because neither of the local development substitutes survives
outside your machine.

## Before the first deploy

### 1. A hosted Postgres

The local development database (`npm run db:dev`) is PGlite listening on
`127.0.0.1:5433`. Nothing outside your laptop can reach it. Any Postgres 14+
works; Neon and Supabase both have a free tier and both hand you two connection
strings, which is exactly what the app expects:

- `DATABASE_URL` — the **pooled** string, used at runtime. Serverless functions
  open and drop connections constantly, so this must be the pooler.
- `DIRECT_URL` — the **direct/non-pooler** string, used by `prisma migrate`.
  Migrations cannot run over a transaction pooler.

Do **not** set `DATABASE_POOL_MAX` in production. It exists to pin the local
PGlite database to a single connection and would throttle a real one.

### 2. Object storage

`STORAGE_DRIVER=local` writes to `./.storage` and is **refused in production** —
deliberately. Vercel's filesystem is ephemeral, so local-disk uploads would
appear to work right up until the next deployment silently discarded every
customer document, contract signature and vehicle photo.

So production needs S3-compatible storage. AWS S3, Cloudflare R2, Backblaze B2
and MinIO all work; R2 has a free tier and no egress charges. Create **two**
buckets:

- a **private** one for customer documents, inspection photos, contracts and
  signatures — reached only through `/api/files/[fileId]`, which checks the
  session and the agency first;
- a **public** one for vehicle photos, agency logos and hero images, which
  anonymous visitors have to load directly.

Without these the app still boots and every other screen works; only uploads
fail, with a message saying storage is not configured.

### 3. A session secret

32+ random bytes. Generate your own — never reuse the development one:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

## Environment variables

Set these in **Project → Settings → Environment Variables**, for Production
(and Preview, if you want previews to work). `SESSION_SECRET` and
`DATABASE_URL` are read while the project is being built, not just at runtime,
so the build fails fast and loudly if either is missing.

| Variable | Required | Notes |
| --- | --- | --- |
| `DATABASE_URL` | yes | Pooled connection string |
| `DIRECT_URL` | yes | Direct connection, for migrations |
| `SESSION_SECRET` | yes | 32+ characters, unique per environment |
| `APP_URL` | yes | `https://<your-project>.vercel.app` |
| `STORAGE_DRIVER` | no | `s3`. Leave unset and S3 is used once it is fully configured |
| `S3_ENDPOINT` | for uploads | R2/B2/MinIO endpoint; omit for AWS S3 |
| `S3_REGION` | for uploads | `auto` for R2 |
| `S3_ACCESS_KEY_ID` | for uploads | |
| `S3_SECRET_ACCESS_KEY` | for uploads | |
| `S3_BUCKET_PRIVATE` | for uploads | Documents, signatures, contracts |
| `S3_BUCKET_PUBLIC` | for uploads | Vehicle photos, logos, hero images |
| `S3_PUBLIC_BASE_URL` | for uploads | CDN or bucket URL serving the public bucket |
| `SESSION_IDLE_DAYS` | no | Defaults to 7 |
| `SESSION_ABSOLUTE_DAYS` | no | Defaults to 30 |
| `APP_ROOT_DOMAIN` | no | Set to serve agencies at `{slug}.example.com` |

`.env` is gitignored and is never read by Vercel — the dashboard is the only
place these values live.

## Deploying

Import the GitHub repository at [vercel.com/new](https://vercel.com/new).
Framework detection picks up Next.js on its own; leave the build and output
settings alone.

Vercel runs `vercel-build` in preference to `build`, and that script applies
migrations before compiling:

```
prisma generate && prisma migrate deploy && next build
```

`migrate deploy` only ever applies migrations that are already committed — it
never generates one and never resets anything. If the database is unreachable
or a migration fails, the build fails and the previous deployment stays live,
which is the behaviour you want.

Nothing in the build reads `.env`; it is gitignored and Vercel never sees one.
`prisma.config.ts` tolerates its absence deliberately, because the whole build
runs on the dashboard's variables instead. The same sequence — migrate, lint,
typecheck, test, build — runs in CI on every pull request against a real
PostgreSQL container, so a deploy that would have failed here fails there first.

## After the first deploy

The database is empty: no agency exists, so every URL 404s. Seed it against the
production database from your machine:

```bash
DATABASE_URL="<pooled>" DIRECT_URL="<direct>" npm run db:seed
```

This creates the demo agency at `/atlas-cars` with vehicles, customers and
reservations, plus an `owner` and an `employee` account whose passwords are
printed at the end and are also written in plain text in `prisma/seed.ts`.
**Change both immediately:**

```bash
npm run auth:set-password -- --agency atlas-cars --user owner
```

That script talks to whichever database `DATABASE_URL` points at, so give it the
production one when resetting a production password.

## Custom domains

Add the domain in Vercel, then set `APP_URL` to it. To give each agency its own
subdomain, add a wildcard domain (`*.example.com`) and set `APP_ROOT_DOMAIN` to
the root — `src/proxy.ts` rewrites `{slug}.example.com/...` onto `/{slug}/...`
so one set of routes serves both shapes.
