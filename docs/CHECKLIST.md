# Implementation checklist

Derived from spec §91. The app stays runnable at the end of every phase (§101).
Tick items as they land.

---

## Phase 1 — Foundation

- [x] Next.js 16 + TypeScript strict + Tailwind v4 scaffold
- [x] Dependencies (Prisma, Argon2, Zod, Decimal, date-fns, S3 SDK, Vitest)
- [x] `prisma/schema.prisma` — full data model (34 models)
- [x] `.env.example` + Zod-validated env module
- [x] Initial migration, hand-edited for `btree_gist` + the `vehicle_blocks`
      exclusion constraint
- [x] Base Prisma singleton (`server/db.ts`) with the pg driver adapter
- [x] Tenant-scoped Prisma client extension (`server/tenant.ts`)
- [x] Argon2id password hash/verify
- [x] Session issue / verify / revoke, cookie handling
- [x] `requireUser` / `requireOwner` guards + permission matrix
- [x] Login page, logout, tenant-resolving proxy
- [x] Role-aware dashboard shell + overview (real counts, Owner-only financials)
- [x] Money and date/timezone primitives
- [x] Seed script: demo agency, owner, employee, settings, locations, vehicles
- [x] Tests: tenant isolation, schema-coverage drift guard, permission matrix,
      money, date/overlap/buffer (80 tests)
- [x] Availability block writer + `23P01` → `VehicleUnavailableError` mapping
- [x] Integration suite for spec §92 (skips until a real `DATABASE_URL` is set)
- [x] **Run the migration and seed against a real database** — PostgreSQL 16
- [x] **Prove the exclusion constraint under real concurrency** — 13/13 green on a
      real server, the two racing tests included

## Phase 1b — Application shell

- [x] Design tokens, light-only, per-agency brand accent
- [x] UI primitives: button, card, badge, field, empty state, page header, icons
- [x] Desktop sidebar + mobile bottom bar + "More" sheet
- [x] Permission-filtered navigation from a single definition
- [x] Role-aware overview: attention banners, fleet counts, today's operations,
      Owner-only financial tiles
- [x] Dashboard error boundary and not-found

## Phase 2 — Fleet

- [x] Vehicle CRUD (Owner) with Zod validation
- [x] Vehicle list/grid, status chips with counts, search + filters
- [x] Vehicle detail: specs, pricing, mileage policy, compliance alerts
- [x] Vehicle gallery: upload, cover selection, delete
- [x] Vehicle status management (display-only field)
- [x] Archive/restore instead of delete
- [x] Vehicle history timeline + upcoming commitments
- [ ] Drag-to-reorder gallery (cover selection works; ordering is by upload)

## Phase 3 — Pricing & locations

- [x] Settings hub
- [x] Locations CRUD + pickup/return fees, hide-instead-of-delete when in use
- [x] "Allow different return location" toggle
- [x] Seasonal rates CRUD (fleet-wide or per vehicle, priority on overlap)
- [x] Extras catalogue (flat or per-day)
- [x] Billing rules + grace period + extra hourly settings
- [x] Turnaround buffer + no-show waiting period
- [x] Security deposit settings (agency toggle + per vehicle amount)
- [x] **Pricing engine** — pure module, no DB/clock/randomness
- [x] Tests: duration under all 3 billing rules, rate tiering, seasonal
      selection, fees, discounts, deposit exclusion, midnight/month boundaries
      (47 tests)

## Phase 4 — Availability

- [x] `vehicle_blocks` write paths for all four block kinds
- [x] **Availability engine** — overlap + buffer
- [x] Search: available vehicles for a date/time window, with filters
- [x] Exclusion-constraint violation handling (`23P01`) → friendly conflict
- [x] Expiring payment-hold cleanup
- [x] Maintenance blocks + conflict warning listing the bookings in the way
- [x] Manual blocks + release
- [x] Fleet calendar (day / week / month), click-to-inspect
- [x] Tests: overlap matrix, buffer edges, calendar placement/clipping,
      agency-local week/month windows
- [x] Concurrent booking + §92 scenario — two simultaneous bookings, and an
      eight-way stampede, leave exactly one block behind

## Phase 5 — Client website

- [x] Tenant resolution: `/{slug}` + host rewrite proxy
- [x] Branding (logo, colors, hero) from agency record
- [x] i18n: AR / FR / EN, RTL for Arabic, per-agency enabled locales
- [x] Home + search form
- [x] Available cars + filters
- [x] Car details + pricing breakdown + deposit shown separately
- [x] Booking: customer info (name, phone, optional email/nationality only)
- [x] Extras selection at booking
- [x] Final availability check → reservation → `AWAITING_CONFIRMATION`
- [x] Confirmation page with booking reference
- [x] My Booking (reference + phone), simplified customer-facing statuses
- [ ] Online payment + expiring checkout hold (spec §29, §30) — agency setting
      exists and defaults off; no provider wired

## Phase 6 — Reservations

- [x] Reservation list, operational buckets, status chips, search, detail
- [x] Awaiting-confirmation queue + call/WhatsApp confirmation panel
- [x] Confirm / cancel with reason, dates released on cancel
- [x] Mark ready for pickup
- [x] Modify reservation (re-run availability, recalculate price)
- [x] No-show + waiting period gate
- [x] Rental extension with conflict check
- [x] Status history + change history timeline
- [x] Manual price override with reason + audit (Owner only)
- [x] Financial history panel (reads real payments/charges)
- [ ] Recording payments — Phase 11

## Phase 7 — Customer CRM

- [x] Auto-create customer on first reservation, phone-based dedupe
- [x] Customer list + search (name, phone, email) + status chips
- [x] Customer profile: history, totals, spend, outstanding, damage count
- [x] Editable contact details with duplicate-phone protection
- [x] Internal notes (add / delete)
- [x] Status flags: normal / watchlist / blacklisted, audited with reason
- [x] Document status panel (capture happens at pickup — Phase 8)

## Phase 8 — Pickup

- [x] Handover flow (mobile-first, each step saves independently)
- [x] Document verification with number + expiry (the check, not the scan)
- [x] Mileage, fuel, condition, notes
- [x] Existing damage records + explicit walk-around confirmation
- [x] Rental payment collection (multi-transaction)
- [x] Security deposit collection, tracked separately from revenue
- [x] Configurable checklist enforcement — blocks completion, names the blocker
- [x] Transition to `ACTIVE`, vehicle `RENTED`, odometer updated
- [ ] Before photos — needs object storage; capture UI lands with return
      inspection (Phase 10)
- [ ] Document scan upload — needs object storage

## Phase 9 — Contracts

- [x] Contract number generation (`CTR-YYYY-NNNNN`), atomic per agency
- [x] Contract generation from a frozen snapshot (agency, customer, verified
      documents, vehicle, pricing, payments, conditions)
- [x] A4 print-ready document rendered from the snapshot, never from live data
- [x] Electronic signature capture on phone/tablet (pointer events, DPR-aware)
- [x] Versioning: signed contracts immutable, amendments create a new version
      and supersede the old one
- [x] Signature stored inline, and to private storage when configured
- [ ] Contract settings editor UI — model and snapshot read the fields; the
      Settings screen for them is not built (seeded values are used)
- [ ] Server-side PDF file generation — print-to-PDF covers V1

## Phase 10 — Active rental & return

- [x] Return inspection: actual time, closing odometer, fuel, condition
- [x] New damage records with repair estimate, separated from pre-existing
- [x] Late fee, extra mileage and fuel charges calculated with workings shown
- [x] Additional charges — proposed, never auto-applied; employee confirms
- [x] Per-charge choice: take from deposit or customer pays separately
- [x] Deposit settlement (retain / refund / shortfall)
- [x] Completion gate, then block rewritten to real return + buffer
- [x] New damage sends the vehicle to MAINTENANCE rather than AVAILABLE
- [ ] After photos + BEFORE/AFTER comparison — needs object storage
- [ ] `RETURN_DUE` / `OVERDUE` scheduled derivation (status is set on return)

## Phase 11 — Financials

- [ ] Multi-transaction payments, partial payments
- [ ] Reservation payment-status rollup recomputed from transactions
- [ ] Security deposit lifecycle + settlement (deduct vs. pay separately)
- [ ] Refunds
- [ ] Financial timeline per reservation
- [ ] Tests: partial payments, refunds, deposit settlement, rollup correctness

## Phase 12 — Maintenance

- [ ] Maintenance records (date and mileage based)
- [ ] Maintenance blocks + booking-conflict resolution
- [ ] Alerts: service due, insurance expiring, inspection due
- [ ] Vehicle expenses + optional receipts
- [ ] Vehicle history timeline

## Phase 13 — Reporting (Owner only)

- [x] Revenue, reservations, completed, cancelled, average booking value
- [x] Fleet utilisation, expenses, outstanding, deposits held, returning customers
- [x] Vehicle performance + **net contribution**
- [x] Booking analytics: pickups by day, duration, cancellation rate, popular
      locations and categories
- [x] Filters: today / week / month / year / custom
- [x] CSV export: reservations, payments, expenses, vehicles, customers
- [ ] PDF and Excel exports (CSV covers V1; same export surface)
- [ ] Most-active-months chart (data computed, only weekdays are charted)

## Phase 14 — Agency customisation

- [x] Team management: add / disable / reset password, sessions revoked on both
- [x] Service layer for agency profile, branding, languages, currency, working
      hours and rental conditions (validated, audited)
- [x] Editing screens: profile, branding, languages/currency, hours & conditions
- [x] Logo and hero upload through the storage driver
- [ ] Employee activity view (query exists, no screen)

## Phase 15 — Communication

- [x] Operational alerts, derived live, role-aware (`/dashboard/alerts`)
- [x] Call + WhatsApp deep links
- [x] Five prepared message templates, editable before sending
- [ ] Stored notification centre with read/unread — alerts are derived instead,
      see the note in `notifications/alerts.ts`
- [ ] Per-agency template enable/disable

## Phase 16 — QA & security

- [ ] Postgres RLS policies (defense in depth)
- [ ] Rate limiting on login, booking, file access
- [ ] Tenant isolation test suite
- [ ] Concurrent booking load test
- [ ] Permission matrix test suite
- [ ] Private file access tests
- [ ] Mobile pickup/return workflow pass
- [ ] Backup + recovery runbook
