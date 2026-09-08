# Car Rental SaaS — Architecture

Companion to `docs/SPEC.md` (the master build specification). This document covers
§101 items 3–6: proposed architecture, security-critical areas, and the assumptions
and decisions taken where the spec left an implementation detail open.

---

## 1. Stack

| Concern           | Choice                                              |
| ----------------- | --------------------------------------------------- |
| Framework         | Next.js 16 (App Router), React 19, TypeScript strict |
| Styling           | Tailwind CSS v4                                      |
| Database          | PostgreSQL (hosted dev instance)                     |
| ORM               | Prisma 7 (query compiler + `@prisma/adapter-pg`)     |
| Auth              | Database-backed sessions + Argon2id (see §7)         |
| Validation        | Zod, at every server boundary                        |
| Money             | Postgres `numeric(12,2)` + `decimal.js`              |
| Dates             | `timestamptz` + `date-fns` / `@date-fns/tz`          |
| Files             | S3-compatible object storage, private bucket         |
| Tests             | Vitest                                               |

---

## 2. Directory layout

```
src/
  proxy.ts                     Host -> /{agencySlug} rewrite (Next 16 proxy convention)
  env.ts                       Zod-validated environment
  app/
    page.tsx                   Platform root
    [agency]/
      page.tsx, cars/, booking/, my-booking/   Public client website
      login/                                   Staff sign-in
      dashboard/                               Agency dashboard (Owner + Employee)
    api/...                    Route handlers (uploads, file access, webhooks)
  server/
    db.ts                      Base (unscoped) Prisma client — singleton
    tenant.ts                  Tenant-scoped Prisma client factory
    tenant-scope.ts            The pure scoping rules (unit-tested)
    auth/
      session.ts               Session issue / verify / revoke
      password.ts              Argon2id hash + verify
      guards.ts                requireOwner / requireUser / requireAgency
      permissions.ts           Single source of truth for the role matrix
    services/                  ALL business logic lives here
      availability/            Overlap engine, blocks, buffer
      pricing/                 Pricing engine, billing rules
      reservations/            Create, confirm, cancel, modify, extend
      payments/                Transactions, deposits, additional charges
      inspections/             Pickup + return, photos, damage
      contracts/               Generation, versioning, signature
      maintenance/             Records, blocks, alerts
      reports/                 Aggregations, exports
      audit/                   Audit log writer
    storage/                   S3 client, presigned upload/download
  lib/                         Pure shared utilities (money, dates, i18n, refs)
  components/                  Shared UI
prisma/
  schema.prisma
  migrations/
  seed.ts
tests/                         Vitest specs for the critical business logic
docs/
```

**Rule:** route handlers and server actions are thin. They authenticate, validate
input with Zod, call a service, and shape a response. No business logic in
`app/`. This satisfies spec §98.4 and keeps the logic testable without HTTP.

---

## 3. Multi-tenancy

Single database, shared schema, `agencyId` on every business table
(spec §4). Isolation is enforced in **four layers**:

1. **Session is the only source of tenant identity.** `agencyId` is read from the
   server-side session record, never from a request body, query string, header or
   route param. (spec §86)
2. **Tenant-scoped Prisma client.** `getTenantDb(agencyId)` returns a client built
   with a Prisma Client Extension that injects `agencyId` into the `where` of every
   read/update/delete and into the `data` of every create, for every tenant-scoped
   model. Application code physically cannot write an unscoped query through it.
   The raw client is exported separately and only used for auth, agency
   provisioning, and public-site lookups that resolve the tenant.

   Prisma's generated types still require `agencyId` on a create even though the
   extension supplies it at runtime, so the client exposes its own tenant as
   `db.$agencyId` and services write `agencyId: db.$agencyId`. That keeps one
   source of truth and avoids per-call-site casts; the runtime override remains
   the thing that actually enforces the boundary if a caller passes a wrong value.
3. **Ownership re-check on nested writes.** Where a write references another row by
   id (e.g. attaching a vehicle to a reservation), the service verifies that row
   belongs to the same agency before proceeding.
4. **Row-Level Security (planned, Phase 16).** Postgres RLS policies keyed on
   `current_setting('app.agency_id')`, set per transaction. Defense in depth in case
   a future query bypasses the extension. Schema is designed to accept this without
   changes.

### Tenant resolution from the URL

Both sides of the product are tenant-scoped by URL, using one mechanism:

- Canonical path: `/{agencySlug}/...` — public site at `/{slug}`, staff sign-in at
  `/{slug}/login`, dashboard at `/{slug}/dashboard`.
- `src/proxy.ts` rewrites `{slug}.{APP_ROOT_DOMAIN}/...` onto that path, so one set
  of pages serves both URL shapes.
- The slug in the URL is **never** treated as authority. The dashboard layout
  compares it against the signed-in user's own agency and redirects if they differ;
  all data still comes from the session's `agencyId`.

Usernames are unique per agency (spec §6), so the login form takes the agency from
the URL rather than from a field the caller controls.

The public site only ever reads through a narrow, explicitly public query surface
(active vehicles, active locations, branding, availability). It never touches
customer, payment or document tables.

---

## 4. The availability engine

This is the highest-risk part of the product (spec §19, §20, §92), so it gets a
dedicated design rather than ad-hoc `WHERE` clauses.

### Single source of occupancy: `vehicle_blocks`

Every reason a vehicle is unavailable writes one row into **`vehicle_blocks`**:

| kind           | Written when                                            |
| -------------- | ------------------------------------------------------- |
| `RESERVATION`  | A reservation enters a blocking status                  |
| `MAINTENANCE`  | A maintenance block is scheduled                        |
| `MANUAL`       | Owner blocks a vehicle by hand                          |
| `PAYMENT_HOLD` | Checkout started with online payment enabled (expiring) |

Availability is then one question against one table, rather than a union of four
different queries that can drift apart.

### Buffer handling

The agency-configured buffer (spec §21) is baked into the stored block as
**trailing padding only**:

```
stored block = [ startsAt , endsAt + bufferMinutes )
```

Padding one side only is what makes the arithmetic correct — if both sides were
padded, two adjacent rentals would each contribute a buffer and the real gap would
be double the configured value. A pickup at exactly `previousEnd + buffer` is
allowed, which matches the §21 worked example (return 18:00, buffer 2h, next
pickup 20:00).

### Database-level guarantee

`vehicle_blocks` carries a generated range column and a GiST exclusion constraint:

```sql
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE vehicle_blocks
  ADD COLUMN period tstzrange
  GENERATED ALWAYS AS (tstzrange(starts_at, ends_at, '[)')) STORED;

ALTER TABLE vehicle_blocks
  ADD CONSTRAINT vehicle_blocks_no_overlap
  EXCLUDE USING gist (vehicle_id WITH =, period WITH &&);
```

Two overlapping blocks for the same vehicle are **impossible to commit**. This is
what makes spec §92 pass under genuine concurrency: two simultaneous checkouts both
pass their application-level check, both attempt to insert, and Postgres rejects
exactly one with `23P01 exclusion_violation`. The service catches that specific
error code and returns *"This vehicle is no longer available for the selected
period"* plus alternatives — no locking, no race window, no retry loop.

Application-level checks (§20's check #1 at search and #2 at checkout) still exist,
because they give a fast, friendly answer in the common case. The constraint is the
thing that makes the guarantee true.

### Expiring payment holds

An exclusion constraint has no notion of time passing, so an expired hold must not
remain a row. Expired holds are deleted lazily inside the same transaction that
creates a new block for that vehicle, and swept periodically. This keeps §30
("do not permanently block a vehicle because of an abandoned checkout") true
without a background job being on the critical path.

### Location feasibility

Per spec §23, no GPS or distance modelling in V1. The configured buffer is the only
turnaround allowance, and it applies regardless of location.

---

## 5. The pricing engine

A pure, dependency-free module (`server/services/pricing`) — deterministic input in,
itemised breakdown out. No database access, no `Date.now()`, no floating point. That
makes the §99 test list straightforward to write.

**Order of resolution:**

1. **Duration** — computed from the agency billing rule (spec §27):
   - `DAY_ROUND_UP` — any part-day counts as a full day.
   - `GRACE_PERIOD` — overrun up to `gracePeriodMinutes` is free, beyond it rounds up.
   - `EXTRA_HOURLY` — overrun beyond grace is charged `extraHourPrice` per started hour.
2. **Rate** — first match wins: seasonal rate covering the pickup date →
   monthly rate (≥30 days) → weekly rate (≥7 days) → daily rate.
3. **Total** — `base + pickupFee + returnFee + extras − discounts` (spec §25).
4. **Security deposit** is computed and returned but **never added to the total**
   and never counted as revenue (spec §10, §28, §33).

Manual override (spec §26) never mutates the calculated figures. `calculatedTotal`
is kept, `manualOverrideAmount` is set alongside it, `finalTotal` is derived, and an
audit row records who, when, and why.

All money is `numeric(12,2)` in Postgres and `Decimal` in TypeScript. There is no
path where a rental amount touches a JS `number` (spec §94).

---

## 6. Dates and times

Every rental timestamp is `timestamptz` — an absolute instant (spec §93). Each
agency stores an IANA `timezone` (default `Africa/Casablanca`), used **only** for
formatting and for interpreting operator-entered wall-clock times. Comparisons,
overlap tests and storage are always in UTC. This keeps midnight, month-boundary
and DST edge cases (spec §99) a formatting concern rather than a correctness one.

---

## 7. Authentication — decision and rationale

The spec recommends Auth.js/NextAuth "or an equivalent secure authentication
implementation". **This build uses database-backed opaque sessions** rather than
Auth.js. Reasons:

- Spec §6 requires an Owner to disable an employee and §79 to reset their password.
  With stateless JWT sessions a disabled employee keeps working until their token
  expires. With server-side sessions, `is_active = false` revokes access on the very
  next request, and password reset can kill all existing sessions.
- Spec §80 wants employee activity traceable; a session row gives a real anchor.
- There is no OAuth requirement in V1 — only username + password — so the
  provider machinery that Auth.js exists to manage is not needed.

Mechanics: a 256-bit random token in an `HttpOnly; Secure; SameSite=Lax` cookie.
The database stores only `HMAC-SHA256(token, SESSION_SECRET)`, so a dump of the
`sessions` table yields nothing usable and the pepper lives outside the database.
Passwords are hashed with **Argon2id** (19 MiB, t=2, p=1). Sessions use sliding
expiry with an absolute cap, and repeated failed logins lock an account for a
short window.

This changes no business rule in §97 — it is an implementation detail chosen for
production-readiness under §101.

---

## 8. File storage

Private S3-compatible bucket. Nothing is world-readable.

- **Upload:** client requests a presigned PUT from a server route that has already
  authorised the user, validated content-type and size, and generated the object key
  as `agency/{agencyId}/{entity}/{id}/{uuid}`.
- **Download:** never a permanent URL. `/api/files/[id]` checks the session, checks
  the file's `agencyId` against the session's, then issues a short-lived presigned
  GET redirect (spec §85).
- Vehicle images and agency logos are the one exception — they are public by
  nature and served from a separate public prefix, because the client website must
  render them for anonymous visitors.

Customer identity documents, signed contracts and signatures are always private
(spec §36, §85, §97.20).

---

## 9. Roles and permissions

Only `OWNER` and `EMPLOYEE` (spec §5, §97.14). The matrix lives in one module,
`server/auth/permissions.ts`, and is consulted both for route guarding and for
hiding UI. Employees are denied: reports, financial KPIs, expenses, pricing,
agency settings, branding, team management, and audit log.

Denial is enforced server-side; hiding it in the UI is a convenience, not the
control (spec §64, §97.17).

---

## 10. Audit and financial history

Two append-only trails, never updated or deleted:

- **`audit_logs`** — sensitive actions with before/after values and a reason
  (spec §80).
- **Payment / deposit / charge rows** — a reservation's financial state is always
  derived by summing transactions, never by overwriting a total (spec §31, §81).
  `amountPaid` and `amountRemaining` on the reservation are denormalised caches
  recomputed from the transaction rows, not authoritative values.

Signed contracts are immutable. A change after signature creates a new contract
version; the original row, its PDF, its signature and its timestamp are preserved
(spec §52, §88).

---

## 11. Assumptions and open items

Recorded per §101.6. None of these change an approved business rule.

1. **Agency provisioning.** The spec never says how an agency is created. V1 seeds
   agencies via a script; a self-serve signup and a platform-superadmin console are
   out of scope until requested.
2. **Routing.** Path-based `/{agencySlug}` is canonical for both the public site
   and the dashboard, with host-based rewriting layered on top. Custom domains are
   a field on `agencies` but DNS/TLS provisioning is not automated in V1.

3. **Prisma version.** Pinned to 7.10.0. `npm install prisma` currently resolves
   `latest` to an 8.0 release candidate whose CLI is a different product; both the
   CLI and the client are therefore pinned exactly. Prisma 7 moves connection URLs
   out of `schema.prisma` into `prisma.config.ts` and requires a driver adapter,
   which is why `src/server/db.ts` constructs `PrismaPg` rather than passing a URL.
4. **Inspections.** §83 lists `pickup_inspections` and `return_inspections` as two
   tables. They are modelled as one `inspections` table with a `type`
   discriminator, which turns §43's BEFORE/AFTER comparison into a single query and
   avoids duplicating the photo and damage relations. §83's closing note explicitly
   permits this.
5. **Online payments.** §29 makes online payment optional per agency and forbids
   storing card data. No provider is named, so the payments service is built against
   an internal `PaymentProvider` interface with a manual/offline implementation.
   Wiring a real gateway is a later, isolated change.
6. **Extras.** §25 lists "Extras" in the pricing engine but never defines them. A
   generic per-agency `extras` catalogue (flat or per-day) is modelled so the
   engine's contract is complete.
7. **Mileage policy.** §45 asks the architecture to *support* unlimited vs.
   allowance + per-km. Both are modelled on the vehicle/agency; the charge is
   computed at return.
8. **Notifications.** §67 is an in-app notification centre. No email/SMS sending is
   built; §68 keeps WhatsApp as `wa.me` deep links with prepared text, not the
   Business API.
9. **Exports.** §73 asks the architecture to *support* PDF/Excel/CSV. CSV is
   implemented in V1; PDF and Excel go through the same export service interface.
10. **Timezone.** Assumed one timezone per agency, not per location.
11. **Currency.** MAD only in V1, but `currency` is stored on every money-bearing row
    so a second currency is additive (spec §94).

### Conflicts found in the spec

- **§18 vs §19.** `vehicles.current_status` and calculated availability can disagree.
  Resolved as §18 directs: `current_status` is an *operational display* field only.
  Every availability decision goes through the engine in §4. The status field is
  never consulted to decide whether a vehicle can be booked.
- **§12 vs §30.** §12 blocks dates the moment a reservation is created; §30 wants a
  temporary, expiring hold during online payment. These are two different block
  kinds — `RESERVATION` (persists until confirmed or cancelled) and `PAYMENT_HOLD`
  (expires) — which is why `vehicle_blocks` carries a `kind` and an optional
  `expiresAt`.
- **§14.** `RETURN_DUE` and `OVERDUE` are time-derived, not operator-set. They are
  stored as real statuses (the spec lists them) but transitioned by a scheduled
  evaluation rather than by a button, so the dashboard is never stale.
